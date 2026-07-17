import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const ASSIGNEE_SELECT = {
  include: { user: { select: { id: true, first_name: true, last_name: true, avatar_url: true, role: true } } },
};

const LINKED_DOCS_INCLUDE = {
  devis: { select: { id: true, number: true, total_ttc: true, object: true } },
  assignments: ASSIGNEE_SELECT,
  devis_docs: { select: { id: true, number: true, total_ttc: true, status: true, object: true, issue_date: true } },
  bcs: { select: { id: true, number: true, total_ttc: true, status: true, issue_date: true } },
  bls: { select: { id: true, number: true, status: true, issue_date: true, delivery_date: true } },
  invoices: { select: { id: true, number: true, total_ttc: true, status: true, balance: true, issue_date: true } },
  expenses: { select: { id: true, description: true, amount: true, category: true, status: true, date: true } },
} as const;

@Injectable()
export class PrestationsService {
  constructor(private prisma: PrismaService) {}

  private validIds(ids: any): string[] {
    return Array.isArray(ids)
      ? ids.filter((uid) => typeof uid === 'string' && uid.trim().length > 0)
      : [];
  }

  async create(data: any, userId: string) {
    const assigneeIds = this.validIds(data.assignee_ids);
    return this.prisma.prestation.create({
      data: {
        nom:         data.nom,
        client:      data.client,
        montant:     Number(data.montant),
        date_debut:  data.date_debut ? new Date(data.date_debut) : null,
        date_fin:    data.date_fin   ? new Date(data.date_fin)   : null,
        description: data.description || null,
        statut:      data.statut || 'EN_COURS',
        devis_id:    data.devis_id   || null,
        created_by:  userId,
        assignments: assigneeIds.length
          ? { create: assigneeIds.map((uid) => ({ user_id: uid })) }
          : undefined,
      },
      include: { devis: { select: { id: true, number: true, total_ttc: true, object: true } }, assignments: ASSIGNEE_SELECT },
    });
  }

  async findAll(filters: { statut?: string; search?: string; user_id?: string } = {}) {
    const where: any = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.search) {
      where.OR = [
        { nom:    { contains: filters.search, mode: 'insensitive' } },
        { client: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.user_id) {
      where.assignments = { some: { user_id: filters.user_id } };
    }
    return this.prisma.prestation.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { devis: { select: { id: true, number: true, total_ttc: true, object: true } }, assignments: ASSIGNEE_SELECT },
    });
  }

  async findOne(id: string) {
    const prestation = await this.prisma.prestation.findUnique({
      where: { id },
      include: LINKED_DOCS_INCLUDE,
    });
    if (!prestation) throw new NotFoundException('Prestation non trouvée');
    return prestation;
  }

  async update(id: string, data: any) {
    const updateData: any = {};
    if (data.nom         !== undefined) updateData.nom         = data.nom;
    if (data.client      !== undefined) updateData.client      = data.client;
    if (data.montant     !== undefined) updateData.montant     = Number(data.montant);
    if (data.date_debut  !== undefined) updateData.date_debut  = data.date_debut ? new Date(data.date_debut) : null;
    if (data.date_fin    !== undefined) updateData.date_fin    = data.date_fin   ? new Date(data.date_fin)   : null;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.statut      !== undefined) updateData.statut      = data.statut;
    if (data.devis_id    !== undefined) updateData.devis_id    = data.devis_id || null;

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.prestation.update({ where: { id }, data: updateData });
      }

      if (data.assignee_ids !== undefined) {
        const validIds = this.validIds(data.assignee_ids);
        await tx.prestationAssignment.deleteMany({ where: { prestation_id: id } });
        if (validIds.length > 0) {
          await tx.prestationAssignment.createMany({
            data: validIds.map((uid) => ({ prestation_id: id, user_id: uid })),
            skipDuplicates: true,
          });
        }
      }

      return tx.prestation.findUnique({ where: { id }, include: LINKED_DOCS_INCLUDE });
    });
  }

  async remove(id: string) {
    await this.prisma.prestationAssignment.deleteMany({ where: { prestation_id: id } });
    return this.prisma.prestation.delete({ where: { id } });
  }
}
