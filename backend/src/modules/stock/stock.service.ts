import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  // ── PRODUCTS ─────────────────────────────────────────────────────────────

  async createProduct(data: {
    sku: string; name: string; category?: string;
    unit: string; quantity?: number; min_threshold?: number; unit_price: number;
    description?: string;
  }) {
    return this.prisma.product.create({ data });
  }

  async findAllProducts(params?: {
    search?: string; category?: string;
    low_stock?: boolean; page?: number; limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = { is_active: true };

    if (params?.category) where.category = params.category;
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { sku: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    // Enrichir avec statut stock
    const enriched = products.map((p) => ({
      ...p,
      quantity: Number(p.quantity),
      min_threshold: Number(p.min_threshold),
      unit_price: Number(p.unit_price),
      stock_value: Number(p.quantity) * Number(p.unit_price),
      stock_status:
        Number(p.quantity) <= 0 ? 'RUPTURE' :
        Number(p.quantity) < Number(p.min_threshold) ? 'LOW' : 'OK',
    }));

    if (params?.low_stock) {
      return {
        data: enriched.filter((p) => p.stock_status !== 'OK'),
        meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
      };
    }

    return { data: enriched, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOneProduct(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        movements: {
          orderBy: { created_at: 'desc' },
          take: 30,
          include: {
            project: { select: { name: true, code: true } },
            creator: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Produit non trouvé');
    return p;
  }

  async updateProduct(id: string, data: any) {
    return this.prisma.product.update({ where: { id }, data });
  }

  async removeProduct(id: string) {
    return this.prisma.product.update({ where: { id }, data: { is_active: false } });
  }

  // ── MOUVEMENTS ────────────────────────────────────────────────────────────

  /**
   * Entrée stock (achat, retour)
   */
  async addStockEntry(data: {
    product_id: string;
    quantity: number;
    source?: string;
    project_id?: string;
    notes?: string;
  }, createdBy: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: data.product_id } });
      if (!product) throw new NotFoundException('Produit non trouvé');

      const updated = await tx.product.update({
        where: { id: data.product_id },
        data: { quantity: { increment: data.quantity } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          product_id: data.product_id,
          type: 'IN',
          quantity: data.quantity,
          source: (data.source as any) || 'PURCHASE',
          project_id: data.project_id,
          notes: data.notes,
          created_by: createdBy,
        },
      });

      return { product: updated, movement };
    });
  }

  /**
   * Ajustement inventaire
   */
  async adjustStock(data: {
    product_id: string;
    new_quantity: number;
    notes: string;
  }, createdBy: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: data.product_id } });
      if (!product) throw new NotFoundException('Produit non trouvé');

      const diff = data.new_quantity - Number(product.quantity);

      const updated = await tx.product.update({
        where: { id: data.product_id },
        data: { quantity: data.new_quantity },
      });

      await tx.stockMovement.create({
        data: {
          product_id: data.product_id,
          type: 'ADJUSTMENT',
          quantity: Math.abs(diff),
          source: 'INVENTORY',
          notes: data.notes || `Ajustement inventaire: ${Number(product.quantity)} → ${data.new_quantity}`,
          created_by: createdBy,
        },
      });

      return updated;
    });
  }

  async findAllMovements(params?: {
    product_id?: string; type?: string; project_id?: string; page?: number;
  }) {
    const page = params?.page || 1;
    const limit = 50;
    const where: any = {};
    if (params?.product_id) where.product_id = params.product_id;
    if (params?.type) where.type = params.type;
    if (params?.project_id) where.project_id = params.project_id;

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          product: { select: { name: true, unit: true, sku: true } },
          project: { select: { name: true, code: true } },
          creator: { select: { first_name: true, last_name: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  // ── DEMANDES ──────────────────────────────────────────────────────────────

  async createMaterialRequest(data: {
    product_id: string; project_id?: string;
    quantity: number; reason?: string;
  }, requestedBy: string) {
    return this.prisma.materialRequest.create({
      data: { ...data, requested_by: requestedBy },
      include: { product: { select: { name: true, unit: true, quantity: true } } },
    });
  }

  async findAllRequests(status?: string) {
    return this.prisma.materialRequest.findMany({
      where: status ? { status } : {},
      orderBy: { created_at: 'desc' },
      include: {
        product: { select: { name: true, unit: true, quantity: true } },
      },
    });
  }

  async approveRequest(id: string, approvedBy: string) {
    return this.prisma.materialRequest.update({
      where: { id },
      data: { status: 'APPROVED', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  async rejectRequest(id: string) {
    return this.prisma.materialRequest.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }

  // ── STATS ─────────────────────────────────────────────────────────────────

  async getStats() {
    const products = await this.prisma.product.findMany({
      where: { is_active: true },
      select: { quantity: true, min_threshold: true, unit_price: true },
    });

    const total = products.length;
    const lowStock = products.filter(
      (p) => Number(p.quantity) > 0 && Number(p.quantity) < Number(p.min_threshold)
    ).length;
    const ruptures = products.filter((p) => Number(p.quantity) <= 0).length;
    const totalValue = products.reduce(
      (s, p) => s + Number(p.quantity) * Number(p.unit_price), 0
    );

    const currentMonth = new Date();
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

    const movements = await this.prisma.stockMovement.count({
      where: { created_at: { gte: startOfMonth } },
    });

    return { total_products: total, low_stock: lowStock, ruptures, total_value: totalValue, movements_this_month: movements };
  }

  async getCategories() {
    const result = await this.prisma.product.groupBy({
      by: ['category'],
      where: { is_active: true, category: { not: null } },
      _count: true,
    });
    return result.map((r) => ({ category: r.category, count: r._count }));
  }
}
