import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FournisseursService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    ice?: string;
    rc?: string;
    if?: string;
    category?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    bank_name?: string;
    rib?: string;
    iban?: string;
    swift?: string;
  }) {
    return this.prisma.fournisseur.create({ data });
  }

  async findAll(params?: { search?: string; category?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = { is_active: true };

    if (params?.category) where.category = params.category;
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { ice: { contains: params.search } },
        { rib: { contains: params.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.fournisseur.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { invoices: true, payments: true } },
        },
      }),
      this.prisma.fournisseur.count({ where }),
    ]);

    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const f = await this.prisma.fournisseur.findUnique({
      where: { id },
      include: {
        invoices: { orderBy: { created_at: 'desc' }, take: 20 },
        payments: { orderBy: { created_at: 'desc' }, take: 20 },
        _count: { select: { invoices: true, payments: true } },
      },
    });
    if (!f) throw new NotFoundException('Fournisseur non trouvé');

    // Calculer stats
    const totalAchete = f.invoices.reduce((s, inv) => s + Number(inv.total_ttc), 0);
    const totalPaye = f.payments.reduce((s, p) => s + Number(p.amount), 0);

    return {
      ...f,
      stats: {
        total_achete: totalAchete,
        total_paye: totalPaye,
        impaye: totalAchete - totalPaye,
      },
    };
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    return this.prisma.fournisseur.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.fournisseur.update({ where: { id }, data: { is_active: false } });
  }

  /**
   * ⭐ Chercher un fournisseur par RIB (pour le matching automatique bancaire)
   */
  async findByRib(rib: string) {
    // Nettoyer le RIB (enlever espaces et tirets)
    const cleanRib = rib.replace(/[\s\-]/g, '');

    const fournisseur = await this.prisma.fournisseur.findFirst({
      where: {
        OR: [
          { rib: cleanRib },
          { rib: { contains: cleanRib.slice(-10) } }, // Match partiel sur les 10 derniers chiffres
          { iban: { contains: cleanRib } },
        ],
      },
    });

    return fournisseur;
  }

  /**
   * Catégories disponibles
   */
  async getCategories() {
    const result = await this.prisma.fournisseur.groupBy({
      by: ['category'],
      where: { is_active: true, category: { not: null } },
      _count: true,
    });
    return result.map((r) => ({ category: r.category, count: r._count }));
  }
}
