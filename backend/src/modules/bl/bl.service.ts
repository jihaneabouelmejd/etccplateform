import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BLStatus, BLSource } from '@prisma/client';

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
  prestation_id?: string;
  signature_id?: string;
  delivery_date?: Date;
  delivered_by?: string;
  delivery_address?: string;
  notes?: string;
  lines: BLLineInput[];
  custom_number?: string;   // numéro saisi manuellement
  issue_date?: Date;        // date saisie manuellement
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
   * Réutilise le même numéro de séquence que le document source (ex: DEV-2026-0089 -> BL-2026-0089).
   * Retombe sur un numéro indépendant en cas de collision.
   */
  private async deriveNumberFromSource(sourceNumber: string): Promise<string> {
    const parts = sourceNumber.split('-');
    if (parts.length >= 3) {
      const year = parts[1];
      const seq = parts[parts.length - 1];
      const candidate = `BL-${year}-${seq}`;
      const exists = await this.prisma.bonLivraison.findUnique({ where: { number: candidate } });
      if (!exists) return candidate;
    }
    return this.generateNumber();
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
        prestation_id: (devis as any).prestation_id ?? undefined,
        // Use override if provided, otherwise inherit from devis
        signature_id: signatureIdOverride ?? (devis as any).signature_id ?? undefined,
        lines,
      },
      createdBy,
    );
  }

  /**
   * Importer un BL reçu en externe (scan OCR ou saisie manuelle) — ne touche pas au stock,
   * n'est jamais lié à un devis/BC de la plateforme (source IMPORTED_OCR / IMPORTED_MANUAL).
   */
  async importBL(data: {
    client_id: string;
    project_id?: string;
    prestation_id?: string;
    source: BLSource;
    imported_file_url?: string;
    ocr_raw_data?: any;
    notes?: string;
    lines: { description: string; quantity: number }[];
  }, createdBy: string) {
    if (!data.lines || data.lines.length === 0) {
      throw new BadRequestException('Un BL doit avoir au moins une ligne');
    }
    const number = await this.generateNumber();

    return this.prisma.bonLivraison.create({
      data: {
        number,
        source: data.source,
        client_id: data.client_id,
        project_id: data.project_id,
        prestation_id: data.prestation_id,
        created_by: createdBy,
        imported_file_url: data.imported_file_url,
        ocr_raw_data: data.ocr_raw_data,
        notes: data.notes,
        status: 'DELIVERED',
        delivered_at: new Date(),
        lines: {
          create: data.lines.map((l, i) => ({
            description: l.description,
            quantity: l.quantity,
            order: i,
          })),
        },
      } as any,
      include: { lines: true, client: { select: { commercial_name: true } } },
    });
  }

  /**
   * Creer un BL avec decrementation stock automatique
   */
  async create(input: CreateBLInput, createdBy: string) {
    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestException('Un BL doit avoir au moins une ligne');
    }

    // Verifier BC si fourni
    const bc = input.bc_id
      ? await this.prisma.bonCommande.findUnique({ where: { id: input.bc_id }, include: { devis: true } })
      : null;
    if (input.bc_id) {
      if (!bc) throw new NotFoundException('BC non trouve');
      if (bc.status === 'CANCELLED') throw new BadRequestException('Ce BC a ete annule');
    }

    // Le BL reprend le numéro de séquence et le site du document source (devis, sinon BC)
    let sourceNumber: string | undefined;
    let siteValue: string | undefined;
    let prestationId: string | undefined = input.prestation_id;
    if (input.devis_id) {
      const devis = await this.prisma.devis.findUnique({ where: { id: input.devis_id } });
      if (devis) {
        sourceNumber = devis.number;
        siteValue = (devis as any).site ?? undefined;
        if (!prestationId) prestationId = (devis as any).prestation_id ?? undefined;
      }
    } else if (bc) {
      if ((bc as any).devis) {
        sourceNumber = (bc as any).devis.number;
        siteValue = (bc as any).devis.site ?? undefined;
      } else {
        sourceNumber = bc.number;
        siteValue = (bc as any).site ?? undefined;
      }
      if (!prestationId) prestationId = (bc as any).prestation_id ?? undefined;
    }

    const number = input.custom_number || (sourceNumber ? await this.deriveNumberFromSource(sourceNumber) : await this.generateNumber());

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
          source: 'INTERNAL',
          bc_id: input.bc_id ?? undefined,
          devis_id: input.devis_id,
          site: siteValue,
          client_id: input.client_id,
          project_id: input.project_id,
          prestation_id: prestationId,
          created_by: createdBy,
          signature_id: input.signature_id,
          issue_date: input.issue_date || new Date(),
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

  async findAll(params?: { status?: BLStatus; search?: string; page?: number; limit?: number; created_by?: string; prestation_id?: string }) {
    const page = params?.page || 1;
    const limit = Math.min(Number(params?.limit) || 50, 500);
    const where: any = {};
    if (params?.created_by) where.created_by = params.created_by;
    if (params?.prestation_id) where.prestation_id = params.prestation_id;
    if (params?.status) {
      where.status = params.status;
    } else {
      where.status = { not: 'CANCELLED' as any };
    }
    if (params?.search) where.number = { contains: params.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.bonLivraison.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { number: 'desc' },
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
        prestation: { select: { id: true, nom: true, client: true } },
      },
    });
    if (!bl) throw new NotFoundException('BL non trouve');
    return bl;
  }

  async update(id: string, input: {
    number?: string;
    issue_date?: string;
    delivery_date?: string;
    delivered_by?: string;
    delivery_address?: string;
    notes?: string;
    signature_id?: string;
    prestation_id?: string | null;
    lines?: BLLineInput[];
  }) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      if (input.lines) {
        await tx.bLLine.deleteMany({ where: { bl_id: id } });
      }
      return tx.bonLivraison.update({
        where: { id },
        data: {
          ...(input.number && { number: input.number }),
          ...(input.issue_date && { issue_date: new Date(input.issue_date) }),
          ...(input.delivery_date !== undefined && { delivery_date: input.delivery_date ? new Date(input.delivery_date) : null }),
          ...(input.delivered_by !== undefined && { delivered_by: input.delivered_by || null }),
          ...(input.delivery_address !== undefined && { delivery_address: input.delivery_address || null }),
          ...(input.notes !== undefined && { notes: input.notes || null }),
          ...(input.signature_id !== undefined && { signature_id: input.signature_id || null }),
          ...(input.prestation_id !== undefined && { prestation_id: input.prestation_id || null }),
          ...(input.lines ? {
            lines: {
              create: input.lines.map((l, i) => ({
                description: l.description,
                quantity: l.quantity,
                order: i,
              })),
            },
          } : {}),
        },
        include: { lines: true, client: { select: { commercial_name: true } } },
      });
    });
  }

  async updateStatus(id: string, status: BLStatus) {
    const data: any = { status };
    if (status === 'SIGNED') data.signed_at = new Date();
    return this.prisma.bonLivraison.update({ where: { id }, data });
  }

  /** Soft-delete : passe le BL en CANCELLED (Corbeille) */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.bonLivraison.update({ where: { id }, data: { status: 'CANCELLED' as any } });
  }

  /** Restaurer depuis la Corbeille */
  async restore(id: string) {
    return this.prisma.bonLivraison.update({ where: { id }, data: { status: 'DELIVERED' } });
  }

  /** Suppression définitive depuis la Corbeille */
  async hardDelete(id: string) {
    await this.prisma.bonLivraison.delete({ where: { id } });
    return { deleted: true };
  }

  /** Lister les BL annulés (Corbeille) */
  async findCancelled() {
    return this.prisma.bonLivraison.findMany({
      where: { status: 'CANCELLED' as any },
      orderBy: { updated_at: 'desc' },
      include: { client: { select: { commercial_name: true } } },
    });
  }

  async saveSignedScan(id: string, signed_scan_url: string) {
    return this.prisma.bonLivraison.update({
      where: { id },
      data: { client_signature_url: signed_scan_url, status: 'SIGNED' },
    });
  }
}
