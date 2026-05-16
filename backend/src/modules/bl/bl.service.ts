import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BLStatus } from '@prisma/client';

interface BLLineInput {
  description: string;
  quantity: number;
  product_id?: string;
}

interface CreateBLInput {
  bc_id?: string;           // optionnel — flux direct devis->BL
  devis_id?: string;
  client_id: string;
  project_id?: string;
  signature_id?: string;
  delivery_date?: Date;
  delivered_by?: string;
  delivery_address?: string;
  notes?: string;
  lines: BLLineInput[];
}

@Injectable()
export class BLService {
  constructor(private prisma: PrismaService) {}

  private async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BL-${year}`;
    const last = await this.prisma.bonLivraison.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
    });
    let seq = 1;
    if (last) seq = parseInt(last.number.split('-')[2], 10) + 1;
    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Creer un BL directement depuis un devis valide (sans BC)
   */
  async createFromDevis(devisId: string, createdBy: string, signatureIdOverride?: string) {
    const devis = await this.prisma.devis.findUnique({
      where: { id: devisId },
      include: {
        lines: true,
        client: true,
      },
    });

    if (!devis) throw new NotFoundException('Devis non trouve');
    if (devis.status !== 'VALIDATED') {
      throw new BadRequestException('Le devis doit etre valide pour creer un BL');
    }

    const lines: BLLineInput[] = devis.lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      product_id: (l as any).product_id ?? undefined,
    }));

    return this.create(
      {
        devis_id: devisId,
        client_id: devis.client_id,
        project_id: devis.project_id ?? undefined,
        // Use override if provided, otherwise inherit from devis
        signature_id: signatureIdOverride ?? (devis as any).signature_id ?? undefined,
        lines,
      },
      createdBy,
    );
  }

  /**
   * Creer un BL avec decrementation stock automatique
   */
  async create(input: CreateBLInput, createdBy: string) {
    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestException('Un BL doit avoir au moins une ligne');
    }

    // Verifier BC si fourni
    if (input.bc_id) {
      const bc = await this.prisma.bonCommande.findUnique({ where: { id: input.bc_id } });
      if (!bc) throw new NotFoundException('BC non trouve');
      if (bc.status === 'CANCELLED') throw new BadRequestException('Ce BC a ete annule');
    }

    const number = await this.generateNumber();

    return this.prisma.$transaction(async (tx) => {
      // 1. Verifier le stock disponible
      for (const line of input.lines) {
        if (line.product_id) {
          const product = await tx.product.findUnique({ where: { id: line.product_id } });
          if (!product) {
            throw new BadRequestException(`Produit non trouve: ${line.product_id}`);
          }
          if (Number(product.quantity) < line.quantity) {
            throw new BadRequestException(
              `Stock insuffisant pour "${product.name}": ${product.quantity} disponible, ${line.quantity} demande`,
            );
          }
        }
      }

      // 2. Creer le BL
      const bl = await tx.bonLivraison.create({
        data: {
          number,
          bc_id: input.bc_id ?? undefined,
          devis_id: input.devis_id,
          client_id: input.client_id,
          project_id: input.project_id,
          created_by: createdBy,
          signature_id: input.signature_id,
          delivery_date: input.delivery_date,
          delivered_by: input.delivered_by,
          delivery_address: input.delivery_address,
          notes: input.notes,
          status: 'DELIVERED',
          delivered_at: new Date(),
          lines: {
            create: input.lines.map((line, i) => ({
              description: line.description,
              quantity: line.quantity,
              product_id: line.product_id,
              order: i,
            })),
          },
        },
        include: { lines: { include: { product: true } } },
      });

      // 3. Decreementer le stock
      const stockAlerts: string[] = [];

      for (const line of input.lines) {
        if (line.product_id) {
          const updatedProduct = await tx.product.update({
            where: { id: line.product_id },
            data: { quantity: { decrement: line.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              product_id: line.product_id,
              type: 'OUT',
              quantity: line.quantity,
              source: 'BL',
              bl_id: bl.id,
              project_id: input.project_id,
              notes: `BL ${number} — ${line.description}`,
              created_by: createdBy,
            },
          });

          if (Number(updatedProduct.quantity) < Number(updatedProduct.min_threshold)) {
            stockAlerts.push(
              `${updatedProduct.name}: ${updatedProduct.quantity} restant(s) (seuil: ${updatedProduct.min_threshold})`,
            );
            await tx.alert.create({
              data: {
                type: 'LOW_STOCK',
                title: `Stock bas: ${updatedProduct.name}`,
                description: `${updatedProduct.quantity} ${updatedProduct.unit} restant(s). Seuil minimum: ${updatedProduct.min_threshold}`,
                severity: Number(updatedProduct.quantity) <= 0 ? 'DANGER' : 'WARN',
                related_type: 'Product',
                related_id: updatedProduct.id,
                target_role: 'GERANT',
              },
            });
          }
        }
      }

      // 4. Mettre a jour le BC si present
      if (input.bc_id) {
        await tx.bonCommande.update({
          where: { id: input.bc_id },
          data: { status: 'DELIVERED' },
        });
      }

      return {
        bl,
        stock_impact: {
          movements_created: input.lines.filter((l) => l.product_id).length,
          type: 'OUT',
          alerts: stockAlerts,
        },
      };
    });
  }

  async findAll(params?: { status?: BLStatus; search?: string; page?: number; created_by?: string }) {
    const page = params?.page || 1;
    const limit = 50;
    const where: any = {};
    if (params?.created_by) where.created_by = params.created_by;
    if (params?.status) where.status = params.status;
    if (params?.search) where.number = { contains: params.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.bonLivraison.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          client: { select: { commercial_name: true } },
          bc: { select: { number: true, devis_id: true } },
          _count: { select: { invoices: true } },
        },
      }),
      this.prisma.bonLivraison.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const bl = await this.prisma.bonLivraison.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { order: 'asc' }, include: { product: true } },
        client: true,
        bc: { include: { devis: { select: { number: true, id: true } } } },
        invoices: { select: { id: true, number: true, status: true } },
        signature: true,
      },
    });
    if (!bl) throw new NotFoundException('BL non trouve');
    return bl;
  }

  async updateStatus(id: string, status: BLStatus) {
    const data: any = { status };
    if (status === 'SIGNED') data.signed_at = new Date();
    return this.prisma.bonLivraison.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.bonLivraison.delete({ where: { id } });
    return { deleted: true };
  }

  async saveSignedScan(id: string, signed_scan_url: string) {
    return this.prisma.bonLivraison.update({
      where: { id },
      data: { client_signature_url: signed_scan_url, status: 'SIGNED' },
    });
  }
}
