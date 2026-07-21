import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AnnonceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MarchesPrivesService } from '../../marches-prives/marches-prives.service';

export interface SearchConsultationsFilters {
  q?: string;
  entreprise_id?: string;
  secteur?: string;
  ville?: string;
  categorie?: string;
  status?: AnnonceStatus;
  budget_min?: number;
  budget_max?: number;
  date_limite_apres?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marchesPrivesService: MarchesPrivesService,
  ) {}

  /**
   * Recherche + filtres. Utilise PostgreSQL Full Text Search (colonne
   * générée search_vector + index GIN, cf. migration) quand un terme de
   * recherche est fourni ; sinon, filtres classiques via Prisma pour rester
   * performant sur de gros volumes.
   */
  async search(filters: SearchConsultationsFilters) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 25;
    const offset = (page - 1) * limit;

    if (filters.q?.trim()) {
      return this.searchFullText(filters, page, limit, offset);
    }

    const where: Prisma.ConsultationWhereInput = {};
    if (filters.entreprise_id) where.entreprise_id = filters.entreprise_id;
    if (filters.secteur) where.secteur = { equals: filters.secteur, mode: 'insensitive' };
    if (filters.ville) where.ville = { equals: filters.ville, mode: 'insensitive' };
    if (filters.categorie) where.categorie = { equals: filters.categorie, mode: 'insensitive' };
    if (filters.status) where.status = filters.status;
    if (filters.budget_min || filters.budget_max) {
      where.budget_estimatif = {
        gte: filters.budget_min || undefined,
        lte: filters.budget_max || undefined,
      };
    }
    if (filters.date_limite_apres) where.date_limite = { gte: filters.date_limite_apres };

    const [total, items] = await Promise.all([
      this.prisma.consultation.count({ where }),
      this.prisma.consultation.findMany({
        where,
        orderBy: { first_seen_at: 'desc' },
        skip: offset,
        take: limit,
        include: { entreprise: { select: { id: true, nom: true, logo_url: true, secteur: true, ville: true } } },
      }),
    ]);

    return { total, page, limit, items };
  }

  private async searchFullText(filters: SearchConsultationsFilters, page: number, limit: number, offset: number) {
    const conditions: Prisma.Sql[] = [Prisma.sql`c.search_vector @@ websearch_to_tsquery('french', ${filters.q})`];
    if (filters.entreprise_id) conditions.push(Prisma.sql`c.entreprise_id = ${filters.entreprise_id}`);
    if (filters.secteur) conditions.push(Prisma.sql`c.secteur ILIKE ${filters.secteur}`);
    if (filters.ville) conditions.push(Prisma.sql`c.ville ILIKE ${filters.ville}`);
    if (filters.categorie) conditions.push(Prisma.sql`c.categorie ILIKE ${filters.categorie}`);
    if (filters.status) conditions.push(Prisma.sql`c.status = ${filters.status}::"AnnonceStatus"`);
    if (filters.budget_min) conditions.push(Prisma.sql`c.budget_estimatif >= ${filters.budget_min}`);
    if (filters.budget_max) conditions.push(Prisma.sql`c.budget_estimatif <= ${filters.budget_max}`);
    if (filters.date_limite_apres) conditions.push(Prisma.sql`c.date_limite >= ${filters.date_limite_apres}`);

    const whereClause = Prisma.join(conditions, ' AND ');

    const [items, totalRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT c.id, c.entreprise_id, c.external_id, c.source_url, c.title, c.description,
               c.categorie, c.secteur, c.ville, c.budget_estimatif, c.devise, c.maitre_ouvrage,
               c.date_publication, c.date_limite, c.keywords, c.status, c.imported_marche_id,
               c.first_seen_at, c.last_seen_at,
               e.nom AS entreprise_nom, e.logo_url AS entreprise_logo_url,
               ts_rank(c.search_vector, websearch_to_tsquery('french', ${filters.q})) AS relevance
        FROM veille_consultations c
        JOIN veille_entreprises e ON e.id = c.entreprise_id
        WHERE ${whereClause}
        ORDER BY relevance DESC, c.first_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM veille_consultations c WHERE ${whereClause}
      `,
    ]);

    return { total: Number(totalRows[0]?.count || 0), page, limit, items };
  }

  async findOne(id: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        entreprise: true,
        history: { orderBy: { changed_at: 'desc' } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable');
    return consultation;
  }

  async markVue(id: string) {
    return this.prisma.consultation.update({
      where: { id },
      data: { status: AnnonceStatus.VUE },
    });
  }

  async ignorer(id: string) {
    return this.prisma.consultation.update({ where: { id }, data: { status: AnnonceStatus.IGNOREE } });
  }

  /** Import manuel d'une consultation vers Marchés Privés (lot 1). Ne
   * modifie aucune donnée existante : crée un nouveau MarchePrive référencé
   * depuis la consultation via imported_marche_id. */
  async importVersMarche(id: string, userId: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id }, include: { entreprise: true } });
    if (!consultation) throw new NotFoundException('Consultation introuvable');
    if (consultation.imported_marche_id) {
      throw new BadRequestException('Cette consultation a déjà été importée en Marché Privé');
    }

    const marche = await this.marchesPrivesService.create(
      {
        objet: consultation.title,
        client_name: consultation.maitre_ouvrage || consultation.entreprise.nom,
        ville: consultation.ville || undefined,
        budget_estimatif: consultation.budget_estimatif ? Number(consultation.budget_estimatif) : undefined,
        devise: consultation.devise || undefined,
        date_limite: consultation.date_limite || undefined,
        source: `Veille — ${consultation.entreprise.nom}`,
        notes: consultation.description || undefined,
      },
      userId,
    );

    await this.prisma.consultation.update({
      where: { id },
      data: { imported_marche_id: marche.id, status: AnnonceStatus.IMPORTEE },
    });

    return marche;
  }
}
