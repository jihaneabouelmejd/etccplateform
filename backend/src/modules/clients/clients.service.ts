import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    commercial_name: string;
    legal_name?: string;
    ice?: string;
    rc?: string;
    if?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address: string;
    city?: string;
    internal_notes?: string;
  }) {
    if (!data.address || !data.address.trim()) {
      throw new BadRequestException("L'adresse du client est obligatoire");
    }
    return this.prisma.client.create({ data });
  }

  async findAll(params?: { search?: string; active?: boolean; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = {};

    if (params?.active !== undefined) where.is_active = params.active;
    if (params?.search) {
      where.OR = [
        { commercial_name: { contains: params.search, mode: 'insensitive' } },
        { ice: { contains: params.search } },
        { contact_person: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { projects: true, invoices: true, devis: true } },
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        projects: { orderBy: { created_at: 'desc' }, take: 10 },
        invoices: { where: { direction: 'ISSUED' }, orderBy: { created_at: 'desc' }, take: 10 },
        devis: { orderBy: { created_at: 'desc' }, take: 10 },
        _count: { select: { projects: true, invoices: true, devis: true, bcs: true, bls: true } },
      },
    });
    if (!client) throw new NotFoundException('Client non trouvé');
    return client;
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    if (data.address !== undefined && !data.address.trim()) {
      throw new BadRequestException("L'adresse du client est obligatoire");
    }
    return this.prisma.client.update({ where: { id }, data });
  }

  async archive(id: string) {
    return this.prisma.client.update({
      where: { id },
      data: { is_active: false, archived_at: new Date() },
    });
  }

  async getTopClients(limit = 5) {
    const clients = await this.prisma.client.findMany({
      where: { is_active: true },
      include: {
        invoices: {
          where: { direction: 'ISSUED', status: { not: 'CANCELLED' } },
          select: { total_ttc: true, status: true },
        },
      },
    });

    return clients
      .map((c) => {
        const totalCA = c.invoices.reduce((sum, inv) => sum + Number(inv.total_ttc), 0);
        const totalUnpaid = c.invoices
          .filter((inv) => inv.status !== 'PAID')
          .reduce((sum, inv) => sum + Number(inv.total_ttc), 0);

        return {
          id: c.id,
          name: c.commercial_name,
          ice: c.ice,
          total_ca: totalCA,
          total_unpaid: totalUnpaid,
        };
      })
      .sort((a, b) => b.total_ca - a.total_ca)
      .slice(0, limit);
  }
}
