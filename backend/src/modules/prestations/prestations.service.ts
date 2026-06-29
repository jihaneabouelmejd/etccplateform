import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PrestationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, userId: string) {
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
      },
      include: { devis: { select: { id: true, number: true, total_ttc: true, object: true } } },
    });
  }

  async findAll(filters: { statut?: string; search?: string } = {}) {
    const where: any = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.search) {
      where.OR = [
        { nom:    { contains: filters.search, mode: 'insensitive' } },
        { client: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.prestation.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { devis: { select: { id: true, number: true, total_ttc: true, object: true } } },
    });
  }

  async findOne(id: string) {
    return this.prisma.prestation.findUnique({
      where: { id },
      include: { devis: { select: { id: true, number: true, total_ttc: true, object: true } } },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.prestation.update({
      where: { id },
      data: {
        ...(data.nom         !== undefined && { nom:         data.nom }),
        ...(data.client      !== undefined && { client:      data.client }),
        ...(data.montant     !== undefined && { montant:     Number(data.montant) }),
        ...(data.date_debut  !== undefined && { date_debut:  data.date_debut ? new Date(data.date_debut) : null }),
        ...(data.date_fin    !== undefined && { date_fin:    data.date_fin   ? new Date(data.date_fin)   : null }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.statut      !== undefined && { statut:      data.statut }),
        ...(data.devis_id    !== undefined && { devis_id:    data.devis_id || null }),
      },
      include: { devis: { select: { id: true, number: true, total_ttc: true, object: true } } },
    });
  }

  async remove(id: string) {
    return this.prisma.prestation.delete({ where: { id } });
  }
}
