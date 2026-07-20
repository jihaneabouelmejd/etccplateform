import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MarcheStage, MarcheDocType } from '@prisma/client';
import { ProjectsService } from '../projects/projects.service';

const MARCHE_INCLUDE = {
  client: { select: { id: true, commercial_name: true } },
  project: { select: { id: true, code: true, name: true } },
  documents: { orderBy: { created_at: 'desc' as const } },
  depenses: { orderBy: { date: 'desc' as const } },
};

@Injectable()
export class MarchesPrivesService {
  constructor(
    private prisma: PrismaService,
    private projectsService: ProjectsService,
  ) {}

  // ─── Marchés ────────────────────────────────────────────────────────────

  async create(data: {
    objet: string;
    reference?: string;
    client_id?: string;
    client_name?: string;
    ville?: string;
    budget_estimatif?: number;
    devise?: string;
    date_limite?: Date;
    source?: string;
    score_ia?: number;
    responsable_id?: string;
    notes?: string;
  }, createdBy: string) {
    if (!data.objet || !data.objet.trim()) {
      throw new BadRequestException("L'objet du marché est requis");
    }
    return this.prisma.marchePrive.create({
      data: {
        objet: data.objet,
        reference: data.reference,
        client_id: data.client_id || undefined,
        client_name: data.client_name,
        ville: data.ville,
        budget_estimatif: data.budget_estimatif,
        devise: data.devise || 'MAD',
        date_limite: data.date_limite,
        source: data.source,
        score_ia: data.score_ia,
        responsable_id: data.responsable_id,
        notes: data.notes,
        created_by: createdBy,
      },
      include: MARCHE_INCLUDE,
    });
  }

  async findAll(params?: {
    stage?: MarcheStage;
    client_id?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = {};

    if (params?.stage) where.stage = params.stage;
    if (params?.client_id) where.client_id = params.client_id;
    if (params?.search) {
      where.OR = [
        { objet: { contains: params.search, mode: 'insensitive' } },
        { reference: { contains: params.search, mode: 'insensitive' } },
        { client_name: { contains: params.search, mode: 'insensitive' } },
        { ville: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.marchePrive.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: MARCHE_INCLUDE,
      }),
      this.prisma.marchePrive.count({ where }),
    ]);

    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const marche = await this.prisma.marchePrive.findUnique({
      where: { id },
      include: MARCHE_INCLUDE,
    });
    if (!marche) throw new NotFoundException('Marché non trouvé');
    return marche;
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    const updateData: any = {};
    const fields = [
      'objet', 'reference', 'client_id', 'client_name', 'ville', 'source',
      'responsable_id', 'notes', 'refuse_reason', 'depot_notes', 'cause_perte',
    ];
    for (const f of fields) if (data[f] !== undefined) updateData[f] = data[f];

    if (data.budget_estimatif !== undefined) updateData.budget_estimatif = data.budget_estimatif;
    if (data.montant_final !== undefined) updateData.montant_final = data.montant_final;
    if (data.score_ia !== undefined) updateData.score_ia = data.score_ia;
    if (data.date_limite !== undefined) updateData.date_limite = data.date_limite ? new Date(data.date_limite) : null;
    if (data.date_depot !== undefined) updateData.date_depot = data.date_depot ? new Date(data.date_depot) : null;
    if (data.dossier_admin_ok !== undefined) updateData.dossier_admin_ok = !!data.dossier_admin_ok;
    if (data.dossier_technique_ok !== undefined) updateData.dossier_technique_ok = !!data.dossier_technique_ok;
    if (data.dossier_financier_ok !== undefined) updateData.dossier_financier_ok = !!data.dossier_financier_ok;

    return this.prisma.marchePrive.update({
      where: { id },
      data: updateData,
      include: MARCHE_INCLUDE,
    });
  }

  /**
   * Changement d'étape manuel (Lot 1 — pas d'automatisation).
   * L'utilisateur fait progresser le dossier lui-même dans le pipeline.
   */
  async changeStage(id: string, stage: MarcheStage, extra: any, userId: string) {
    await this.findOne(id);
    const data: any = { stage };

    if (stage === 'PERDU' && !extra?.cause_perte) {
      throw new BadRequestException('La cause de la perte est requise');
    }
    if (stage === 'A_VALIDER' || stage === 'DEPOSE' || stage === 'GAGNE') {
      // marquage validation si pas déjà fait
      data.valide_par_id = extra?.valide_par_id || userId;
      data.valide_at = extra?.valide_at ? new Date(extra.valide_at) : new Date();
    }
    if (stage === 'DEPOSE') {
      data.date_depot = extra?.date_depot ? new Date(extra.date_depot) : new Date();
      data.responsable_depot_id = extra?.responsable_depot_id || userId;
      if (extra?.depot_notes !== undefined) data.depot_notes = extra.depot_notes;
    }
    if (stage === 'GAGNE') {
      if (extra?.montant_final !== undefined) data.montant_final = extra.montant_final;
    }
    if (stage === 'PERDU') {
      data.cause_perte = extra.cause_perte;
      if (extra?.notes !== undefined) data.notes = extra.notes;
    }

    return this.prisma.marchePrive.update({ where: { id }, data, include: MARCHE_INCLUDE });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.marchePrive.delete({ where: { id } });
  }

  /**
   * Transformation en chantier — action manuelle en un clic, réservée
   * aux marchés au stade GAGNE. Réutilise ProjectsService.create() du
   * module Chantiers existant sans le modifier.
   */
  async transformerEnChantier(id: string, createdBy: string, extra?: { start_date?: Date; end_date?: Date; address?: string }) {
    const marche = await this.findOne(id);
    if (marche.stage !== 'GAGNE') {
      throw new BadRequestException('Seul un marché gagné peut être transformé en chantier');
    }
    if (marche.project_id) {
      throw new BadRequestException('Ce marché a déjà été transformé en chantier');
    }
    if (!marche.client_id) {
      throw new BadRequestException("Le marché doit être lié à un client existant pour être transformé en chantier");
    }

    const project = await this.projectsService.create({
      name: marche.objet,
      description: marche.notes || undefined,
      client_id: marche.client_id,
      budget_amount: Number(marche.montant_final ?? marche.budget_estimatif ?? 0),
      start_date: extra?.start_date,
      end_date: extra?.end_date,
      address: extra?.address,
      city: marche.ville || undefined,
    }, createdBy);

    await this.prisma.marchePrive.update({ where: { id }, data: { project_id: project.id } });
    return this.findOne(id);
  }

  // ─── Documents ──────────────────────────────────────────────────────────

  async addDocument(marcheId: string, data: {
    type?: MarcheDocType;
    nom: string;
    file_url: string;
    obligatoire?: boolean;
    expire_at?: Date;
  }, uploadedBy: string) {
    await this.findOne(marcheId);
    if (!data.nom || !data.file_url) {
      throw new BadRequestException('Nom et fichier requis');
    }
    return this.prisma.marcheDocument.create({
      data: {
        marche_id: marcheId,
        type: data.type || 'AUTRE',
        nom: data.nom,
        file_url: data.file_url,
        obligatoire: !!data.obligatoire,
        expire_at: data.expire_at,
        uploaded_by: uploadedBy,
      },
    });
  }

  async updateDocument(docId: string, data: { valide?: boolean; obligatoire?: boolean; expire_at?: Date; nom?: string }) {
    const doc = await this.prisma.marcheDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document non trouvé');
    const updateData: any = {};
    if (data.valide !== undefined) updateData.valide = !!data.valide;
    if (data.obligatoire !== undefined) updateData.obligatoire = !!data.obligatoire;
    if (data.nom !== undefined) updateData.nom = data.nom;
    if (data.expire_at !== undefined) updateData.expire_at = data.expire_at ? new Date(data.expire_at) : null;
    return this.prisma.marcheDocument.update({ where: { id: docId }, data: updateData });
  }

  async removeDocument(docId: string) {
    const doc = await this.prisma.marcheDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document non trouvé');
    return this.prisma.marcheDocument.delete({ where: { id: docId } });
  }

  // ─── Dépenses ───────────────────────────────────────────────────────────

  async addDepense(marcheId: string, data: {
    libelle: string;
    montant: number;
    date?: Date;
    categorie?: string;
    notes?: string;
  }, createdBy: string) {
    await this.findOne(marcheId);
    if (!data.libelle || data.montant === undefined) {
      throw new BadRequestException('Libellé et montant requis');
    }
    return this.prisma.marcheDepense.create({
      data: {
        marche_id: marcheId,
        libelle: data.libelle,
        montant: data.montant,
        date: data.date || new Date(),
        categorie: data.categorie,
        notes: data.notes,
        created_by: createdBy,
      },
    });
  }

  async updateDepense(depId: string, data: { libelle?: string; montant?: number; date?: Date; categorie?: string; notes?: string }) {
    const dep = await this.prisma.marcheDepense.findUnique({ where: { id: depId } });
    if (!dep) throw new NotFoundException('Dépense non trouvée');
    const updateData: any = {};
    if (data.libelle !== undefined) updateData.libelle = data.libelle;
    if (data.montant !== undefined) updateData.montant = data.montant;
    if (data.categorie !== undefined) updateData.categorie = data.categorie;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.date !== undefined) updateData.date = new Date(data.date);
    return this.prisma.marcheDepense.update({ where: { id: depId }, data: updateData });
  }

  async removeDepense(depId: string) {
    const dep = await this.prisma.marcheDepense.findUnique({ where: { id: depId } });
    if (!dep) throw new NotFoundException('Dépense non trouvée');
    return this.prisma.marcheDepense.delete({ where: { id: depId } });
  }

  // ─── Dashboard / Statistiques ──────────────────────────────────────────

  async getStats() {
    const stages: MarcheStage[] = ['NOUVEAU', 'RETENU', 'EN_PREPARATION', 'A_VALIDER', 'DEPOSE', 'GAGNE', 'PERDU'];
    const counts = await Promise.all(stages.map((s) => this.prisma.marchePrive.count({ where: { stage: s } })));
    const byStage: Record<string, number> = {};
    stages.forEach((s, i) => { byStage[s] = counts[i]; });

    const [depensesAgg, gagnesAgg, perdusAgg, alertesDatesLimites] = await Promise.all([
      this.prisma.marcheDepense.aggregate({ _sum: { montant: true } }),
      this.prisma.marchePrive.aggregate({ where: { stage: 'GAGNE' }, _sum: { montant_final: true } }),
      this.prisma.marchePrive.aggregate({ where: { stage: 'PERDU' }, _sum: { budget_estimatif: true } }),
      this.prisma.marchePrive.findMany({
        where: {
          stage: { in: ['NOUVEAU', 'RETENU', 'EN_PREPARATION', 'A_VALIDER'] },
          date_limite: { not: null, lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true, objet: true, date_limite: true, stage: true },
        orderBy: { date_limite: 'asc' },
        take: 10,
      }),
    ]);

    const gagnes = byStage['GAGNE'] || 0;
    const perdus = byStage['PERDU'] || 0;
    const tauxReussite = gagnes + perdus > 0 ? Math.round((gagnes / (gagnes + perdus)) * 100) : 0;

    return {
      by_stage: byStage,
      total_depenses: Number(depensesAgg._sum.montant || 0),
      montant_total_gagne: Number(gagnesAgg._sum.montant_final || 0),
      montant_total_perdu: Number(perdusAgg._sum.budget_estimatif || 0),
      taux_reussite: tauxReussite,
      alertes_dates_limites: alertesDatesLimites,
    };
  }
}
