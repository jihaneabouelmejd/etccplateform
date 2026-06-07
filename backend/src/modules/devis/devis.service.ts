import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DevisStatus } from '@prisma/client';

interface DevisLineInput {
  description: string;
  quantity: number;
  unit_price: number;
}

interface CreateDevisInput {
  client_id: string;
  project_id?: string;
  signature_id?: string;
  object?: string;
  discount_rate?: number;
  validity_days?: number;
  payment_terms?: string;
  notes?: string;
  lines: DevisLineInput[];
}

@Injectable()
export class DevisService {
  constructor(private prisma: PrismaService) {}

  /**
   * Générer numéro de devis : DEV-2026-0089
   */
  private async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DEV-${year}`;

    const last = await this.prisma.devis.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
    });

    let seq = 1;
    if (last) {
      const parts = last.number.split('-');
      seq = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Calcul des montants avec réduction et TVA
   * Réduction commerciale (%) → TVA calculée sur HT net (pas HT brut)
   */
  private computeTotals(lines: DevisLineInput[], discountRate: number, tvaRate = 20) {
    const totalHtBrut = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const discountAmount = Math.round(totalHtBrut * (discountRate / 100) * 100) / 100;
    const totalHtNet = totalHtBrut - discountAmount;
    const tvaAmount = Math.round(totalHtNet * (tvaRate / 100) * 100) / 100;
    const totalTtc = totalHtNet + tvaAmount;

    return {
      total_ht_brut: totalHtBrut,
      discount_rate: discountRate,
      discount_amount: discountAmount,
      total_ht_net: totalHtNet,
      tva_rate: tvaRate,
      tva_amount: tvaAmount,
      total_ttc: totalTtc,
    };
  }

  async create(input: CreateDevisInput, createdBy: string) {
    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestException('Un devis doit avoir au moins une ligne');
    }

    const number = await this.generateNumber();
    const discountRate = input.discount_rate || 0;
    const totals = this.computeTotals(input.lines, discountRate);

    const validityDays = input.validity_days || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);

    return this.prisma.devis.create({
      data: {
        number,
        client_id: input.client_id,
        project_id: input.project_id,
        created_by: createdBy,
        signature_id: input.signature_id,
        object: input.object,
        validity_days: validityDays,
        expires_at: expiresAt,
        payment_terms: input.payment_terms,
        notes: input.notes,
        ...totals,
        lines: {
          create: input.lines.map((line, i) => ({
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            total_ht: line.quantity * line.unit_price,
            order: i,
          })),
        },
      },
      include: {
        lines: { orderBy: { order: 'asc' } },
        client: { select: { commercial_name: true, ice: true } },
        signature: true,
      },
    });
  }

  async findAll(params?: {
    status?: DevisStatus;
    statuses?: DevisStatus[];
    client_id?: string;
    search?: string;
    page?: number;
    limit?: number;
    created_by?: string;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = {};

    if (params?.created_by) where.created_by = params.created_by;
    if (params?.statuses && params.statuses.length > 0) {
      where.status = { in: params.statuses };
    } else if (params?.status) {
      where.status = params.status;
    }
    if (params?.client_id) where.client_id = params.client_id;
    if (params?.search) {
      where.OR = [
        { number: { contains: params.search, mode: 'insensitive' } },
        { object: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.devis.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          client: { select: { commercial_name: true } },
          project: { select: { name: true, code: true } },
          _count: { select: { bcs: true } },
        },
      }),
      this.prisma.devis.count({ where }),
    ]);

    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const devis = await this.prisma.devis.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { order: 'asc' } },
        client: true,
        project: true,
        creator: { select: { first_name: true, last_name: true } },
        signature: true,
        bcs: { select: { id: true, number: true, status: true } },
      },
    });
    if (!devis) throw new NotFoundException('Devis non trouvé');
    return devis;
  }

  /**
   * Modifier un devis (tous statuts autorisés)
   */
  async update(id: string, input: Partial<CreateDevisInput>) {
    const devis = await this.findOne(id);

    const discountRate = input.discount_rate ?? Number(devis.discount_rate);
    const lines = input.lines ?? devis.lines.map(l => ({
      description: l.description,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
    }));
    const totals = this.computeTotals(lines, discountRate);

    // Wrap delete+create in a transaction to keep lines consistent
    return this.prisma.$transaction(async (tx) => {
      if (input.lines) {
        await tx.devisLine.deleteMany({ where: { devis_id: id } });
      }

      return tx.devis.update({
        where: { id },
        data: {
          client_id: input.client_id ?? devis.client_id,
          project_id: input.project_id !== undefined ? input.project_id : devis.project_id,
          object: input.object !== undefined ? input.object : devis.object,
          payment_terms: input.payment_terms !== undefined ? input.payment_terms : devis.payment_terms,
          notes: input.notes !== undefined ? input.notes : devis.notes,
          signature_id: input.signature_id !== undefined ? (input.signature_id || null) : devis.signature_id,
          ...totals,
          ...(input.lines ? {
            lines: {
              create: input.lines.map((line, i) => ({
                description: line.description,
                quantity: line.quantity,
                unit_price: line.unit_price,
                total_ht: line.quantity * line.unit_price,
                order: i + 1,
              })),
            },
          } : {}),
        },
        include: { lines: true, client: { select: { commercial_name: true } } },
      });
    });
  }

  async updateStatus(id: string, status: DevisStatus) {
    const data: any = { status };
    if (status === 'SENT') data.sent_at = new Date();
    if (status === 'VALIDATED') data.validated_at = new Date();
    if (status === 'REJECTED') data.rejected_at = new Date();

    return this.prisma.devis.update({ where: { id }, data });
  }

  /** Soft-delete : passe le devis en CANCELLED (Corbeille) */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.devis.update({ where: { id }, data: { status: 'CANCELLED' as any } });
  }

  /** Restaurer depuis la Corbeille */
  async restore(id: string) {
    return this.prisma.devis.update({ where: { id }, data: { status: 'DRAFT' } });
  }

  /** Suppression définitive depuis la Corbeille */
  async hardDelete(id: string) {
    await this.prisma.devisLine.deleteMany({ where: { devis_id: id } });
    return this.prisma.devis.delete({ where: { id } });
  }

  /** Lister les devis annulés (Corbeille) */
  async findCancelled() {
    return this.prisma.devis.findMany({
      where: { status: 'CANCELLED' as any },
      orderBy: { updated_at: 'desc' },
      include: { client: { select: { commercial_name: true } } },
    });
  }

  /**
   * Dupliquer un devis existant
   */
  async duplicate(id: string, createdBy: string) {
    const original = await this.findOne(id);
    const number = await this.generateNumber();

    return this.prisma.devis.create({
      data: {
        number,
        client_id: original.client_id,
        project_id: original.project_id,
        created_by: createdBy,
        object: `${original.object} (copie)`,
        validity_days: original.validity_days,
        payment_terms: original.payment_terms,
        notes: original.notes,
        total_ht_brut: original.total_ht_brut,
        discount_rate: original.discount_rate,
        discount_amount: original.discount_amount,
        total_ht_net: original.total_ht_net,
        tva_rate: original.tva_rate,
        tva_amount: original.tva_amount,
        total_ttc: original.total_ttc,
        lines: {
          create: original.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            total_ht: line.total_ht,
            order: line.order,
          })),
        },
      },
      include: { lines: true, client: { select: { commercial_name: true } } },
    });
  }

  /**
   * Récupérer les lignes d'un devis pour auto-fill BL (SANS les prix)
   */
  async getLinesForBL(devisId: string) {
    const devis = await this.findOne(devisId);
    if (devis.status !== 'VALIDATED') {
      throw new BadRequestException('Le devis doit être validé pour créer un BL');
    }

    return {
      client_id: devis.client_id,
      project_id: devis.project_id,
      lines: devis.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        // ⚠ PAS de prix — le BL ne montre pas les prix
      })),
    };
  }

  /**
   * Récupérer les lignes d'un devis pour auto-fill Facture (AVEC les prix)
   */
  async getLinesForInvoice(devisId: string) {
    const devis = await this.findOne(devisId);
    return {
      client_id: devis.client_id,
      project_id: devis.project_id,
      discount_rate: Number(devis.discount_rate),
      lines: devis.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit_price: Number(l.unit_price),
        total_ht: Number(l.total_ht),
      })),
    };
  }

  /**
   * Dashboard KPIs
   */
  async getStats() {
    const [total, validated, pending, expired] = await Promise.all([
      this.prisma.devis.count(),
      this.prisma.devis.count({ where: { status: 'VALIDATED' } }),
      this.prisma.devis.count({ where: { status: 'SENT' } }),
      this.prisma.devis.count({ where: { status: 'EXPIRED' } }),
    ]);
    const conversionRate = total > 0 ? Math.round((validated / total) * 100) : 0;
    return { total, validated, pending, expired, conversion_rate: conversionRate };
  }
}
