import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntrepriseStatus, EntrepriseType, SourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScrapingOrchestratorService } from '../scraping/scraping-orchestrator.service';
import { ScrapingSchedulerService } from '../scraping/scraping-scheduler.service';

@Injectable()
export class EntreprisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ScrapingOrchestratorService,
    private readonly scheduler: ScrapingSchedulerService,
  ) {}

  async findAll(filters: {
    status?: EntrepriseStatus;
    type_entreprise?: EntrepriseType;
    secteur?: string;
    ville?: string;
    search?: string;
    favorisUserId?: string;
    currentUserId?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.EntrepriseWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.type_entreprise) where.type_entreprise = filters.type_entreprise;
    if (filters.secteur) where.secteur = { equals: filters.secteur, mode: 'insensitive' };
    if (filters.ville) where.ville = { equals: filters.ville, mode: 'insensitive' };
    if (filters.search) where.nom = { contains: filters.search, mode: 'insensitive' };
    if (filters.favorisUserId) where.favoris = { some: { user_id: filters.favorisUserId } };

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 50;

    const [total, items] = await Promise.all([
      this.prisma.entreprise.count({ where }),
      this.prisma.entreprise.findMany({
        where,
        orderBy: [{ status: 'asc' }, { nom: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { consultations: true } },
          ...(filters.currentUserId
            ? { favoris: { where: { user_id: filters.currentUserId } } }
            : {}),
        },
      }),
    ]);

    return { total, page, limit, items };
  }

  findOne(id: string) {
    return this.prisma.entreprise.findUnique({
      where: { id },
      include: {
        _count: { select: { consultations: true } },
        logs: { orderBy: { started_at: 'desc' }, take: 10 },
      },
    }).then((e) => {
      if (!e) throw new NotFoundException('Entreprise introuvable');
      return e;
    });
  }

  async create(data: {
    nom: string;
    logo_url?: string;
    secteur?: string;
    ville?: string;
    site_officiel?: string;
    type_entreprise?: EntrepriseType;
    pages_surveillees?: string[];
    frequence_cron?: string;
    categorie_defaut?: string;
  }, createdBy?: string) {
    if (!data.nom?.trim()) throw new BadRequestException("Le nom de l'entreprise est requis");
    return this.prisma.entreprise.create({
      data: {
        nom: data.nom.trim(),
        logo_url: data.logo_url,
        secteur: data.secteur,
        ville: data.ville,
        site_officiel: data.site_officiel,
        type_entreprise: data.type_entreprise || EntrepriseType.AUTRE,
        pages_surveillees: data.pages_surveillees || [],
        frequence_cron: data.frequence_cron || '0 */6 * * *',
        categorie_defaut: data.categorie_defaut,
        status: EntrepriseStatus.A_CONFIGURER,
        type: SourceType.HTML_GENERIC,
        created_by: createdBy,
      },
    });
  }

  async update(id: string, data: Partial<{
    nom: string;
    logo_url: string;
    secteur: string;
    ville: string;
    site_officiel: string;
    type_entreprise: EntrepriseType;
    pages_surveillees: string[];
    frequence_cron: string;
    categorie_defaut: string;
    status: EntrepriseStatus;
  }>) {
    const entreprise = await this.prisma.entreprise.update({ where: { id }, data });

    if (data.status !== undefined || data.frequence_cron !== undefined) {
      if (entreprise.status === EntrepriseStatus.ACTIF) {
        this.scheduler.registerJob(entreprise.id, entreprise.nom, entreprise.frequence_cron || '0 */6 * * *');
      } else {
        this.scheduler.unregisterJob(entreprise.id);
      }
    }
    return entreprise;
  }

  /** Configuration des sélecteurs CSS depuis l'admin "Sources à configurer" —
   * aucune modification de code nécessaire. Bascule automatiquement le
   * type d'extraction sur HTML_CONFIGURED. */
  async configureSelectors(id: string, config: Record<string, any>) {
    return this.prisma.entreprise.update({
      where: { id },
      data: { config, type: SourceType.HTML_CONFIGURED, status: EntrepriseStatus.A_CONFIGURER },
    });
  }

  async remove(id: string) {
    this.scheduler.unregisterJob(id);
    return this.prisma.entreprise.delete({ where: { id } });
  }

  /** Déclenche une synchronisation manuelle immédiate (bouton "Surveiller" /
   * "Synchroniser maintenant"). Si le résultat est concluant, active
   * l'entreprise et planifie son cron automatique. */
  async syncNow(id: string) {
    const summary = await this.orchestrator.syncEntreprise(id);
    const entreprise = await this.prisma.entreprise.findUnique({ where: { id } });
    if (entreprise && entreprise.status === EntrepriseStatus.ACTIF) {
      this.scheduler.registerJob(entreprise.id, entreprise.nom, entreprise.frequence_cron || '0 */6 * * *');
    }
    return summary;
  }

  async toggleFavori(entrepriseId: string, userId: string) {
    const existing = await this.prisma.entrepriseFavori.findUnique({
      where: { user_id_entreprise_id: { user_id: userId, entreprise_id: entrepriseId } },
    });
    if (existing) {
      await this.prisma.entrepriseFavori.delete({ where: { id: existing.id } });
      return { favori: false };
    }
    await this.prisma.entrepriseFavori.create({ data: { user_id: userId, entreprise_id: entrepriseId } });
    return { favori: true };
  }

  async sourcesAConfigurer() {
    return this.prisma.entreprise.findMany({
      where: { status: EntrepriseStatus.A_CONFIGURER },
      orderBy: { nom: 'asc' },
    });
  }

  async dashboardStats() {
    const [totalEntreprises, actives, aConfigurer, enErreur, totalConsultations, aujourdHui, parSecteur, parVille, plusActives] =
      await Promise.all([
        this.prisma.entreprise.count(),
        this.prisma.entreprise.count({ where: { status: EntrepriseStatus.ACTIF } }),
        this.prisma.entreprise.count({ where: { status: EntrepriseStatus.A_CONFIGURER } }),
        this.prisma.entreprise.count({ where: { status: EntrepriseStatus.ERREUR } }),
        this.prisma.consultation.count(),
        this.prisma.consultation.count({
          where: { first_seen_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        }),
        this.prisma.consultation.groupBy({ by: ['secteur'], _count: { _all: true }, where: { secteur: { not: null } } }),
        this.prisma.consultation.groupBy({ by: ['ville'], _count: { _all: true }, where: { ville: { not: null } } }),
        this.prisma.entreprise.findMany({
          orderBy: { total_consultations: 'desc' },
          take: 10,
          select: { id: true, nom: true, total_consultations: true, logo_url: true, secteur: true },
        }),
      ]);

    return {
      total_entreprises: totalEntreprises,
      entreprises_actives: actives,
      entreprises_a_configurer: aConfigurer,
      entreprises_en_erreur: enErreur,
      total_consultations: totalConsultations,
      nouvelles_consultations_aujourdhui: aujourdHui,
      repartition_par_secteur: parSecteur.map((s) => ({ secteur: s.secteur, total: s._count._all })),
      repartition_par_ville: parVille.map((v) => ({ ville: v.ville, total: v._count._all })),
      entreprises_plus_actives: plusActives,
    };
  }
}
