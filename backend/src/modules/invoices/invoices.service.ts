import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceDirection, InvoiceSource, InvoiceStatus } from '@prisma/client';

interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: number;
}

interface CreateIssuedInvoiceInput {
  bl_id: string;
  signature_id?: string;
  discount_rate?: number;
  due_date?: Date;
  payment_terms?: string;
  acompte_amount?: number;
  payment_method?: string;
  notes?: string;
  lines?: InvoiceLineInput[];
}

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  private async generateNumber(direction: InvoiceDirection): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = direction === 'ISSUED' ? `FAC-${year}` : `FAC-A-${year}`;
    const last = await this.prisma.invoice.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
    });
    let seq = 1;
    if (last) seq = parseInt(last.number.split('-').pop()!, 10) + 1;
    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  private computeTotals(lines: InvoiceLineInput[], discountRate: number, tvaRate = 20) {
    const totalHtBrut = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const discountAmount = Math.round(totalHtBrut * (discountRate / 100) * 100) / 100;
    const totalHtNet = totalHtBrut - discountAmount;
    const tvaAmount = Math.round(totalHtNet * (tvaRate / 100) * 100) / 100;
    const totalTtc = totalHtNet + tvaAmount;
    return { total_ht_brut: totalHtBrut, discount_rate: discountRate, discount_amount: discountAmount, total_ht_net: totalHtNet, tva_rate: tvaRate, tva_amount: tvaAmount, total_ttc: totalTtc };
  }

  /**
   * ⭐ Créer une facture émise à partir d'un BL livré
   * Les lignes + prix viennent du Devis source, pas du BL
   */
  async createFromBL(input: CreateIssuedInvoiceInput, createdBy: string) {
    // Récupérer BL + BC + Devis pour les données
    const bl = await this.prisma.bonLivraison.findUnique({
      where: { id: input.bl_id },
      include: {
        bc: {
          include: { devis: { include: { lines: { orderBy: { order: 'asc' } } } } },
        },
        lines: true,
      },
    });

    if (!bl) throw new NotFoundException('BL non trouvé');
    if (bl.status !== 'DELIVERED' && bl.status !== 'SIGNED') {
      throw new BadRequestException('Le BL doit être livré ou signé avant facturation');
    }

    // Récupérer les prix du devis source (via BC ou directement via devis_id)
    let devis = bl.bc?.devis;
    if (!devis && bl.devis_id) {
      devis = await this.prisma.devis.findUnique({
        where: { id: bl.devis_id },
        include: { lines: { orderBy: { order: 'asc' } } },
      }) as any;
    }
    let lines: InvoiceLineInput[];

    if (input.lines && input.lines.length > 0) {
      // Lignes fournies manuellement (l'utilisateur peut ajuster)
      lines = input.lines;
    } else if (devis) {
      // Auto-fill depuis le devis (AVEC les prix cette fois)
      lines = devis.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
      }));
    } else {
      throw new BadRequestException('Aucune ligne fournie et pas de devis source trouvé');
    }

    const number = await this.generateNumber('ISSUED');
    const discountRate = input.discount_rate ?? (devis ? Number(devis.discount_rate) : 0);
    const totals = this.computeTotals(lines, discountRate);
    const acompte = input.acompte_amount || 0;

    const dueDate = input.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      // 1. Créer la facture
      const invoice = await tx.invoice.create({
        data: {
          number,
          direction: 'ISSUED',
          source: 'INTERNAL',
          bl_id: input.bl_id,
          bc_id: bl.bc_id,
          devis_id: bl.devis_id,
          client_id: bl.client_id,
          project_id: bl.project_id,
          created_by: createdBy,
          signature_id: input.signature_id,
          issue_date: new Date(),
          due_date: dueDate,
          payment_method: input.payment_method as any,
          payment_terms: input.payment_terms,
          acompte_amount: acompte,
          amount_paid: acompte,
          balance: totals.total_ttc - acompte,
          status: acompte >= totals.total_ttc ? 'PAID' : 'SENT',
          notes: input.notes,
          ...totals,
          lines: {
            create: lines.map((line, i) => ({
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
          client: true,
          signature: true,
        },
      });

      // 2. Mettre à jour le BL comme facturé
      await tx.bonLivraison.update({
        where: { id: input.bl_id },
        data: { status: 'INVOICED' },
      });

      return {
        invoice,
        impact: {
          ca_registered: totals.total_ttc,
          tva_collected: totals.tva_amount,
          creance: totals.total_ttc - acompte,
          status: acompte >= totals.total_ttc ? 'PAID' : 'UNPAID',
        },
      };
    });
  }

  /**
   * Enregistrer une facture d'achat (reçue d'un fournisseur, scannée)
   */
  async createPurchaseInvoice(data: {
    fournisseur_id?: string;
    project_id?: string;
    scanned_file_url?: string;
    ocr_raw_data?: any;
    total_ht_brut: number;
    tva_amount: number;
    total_ttc: number;
    issue_date?: Date;
    due_date?: Date;
    notes?: string;
    lines?: InvoiceLineInput[];
  }, createdBy: string) {
    const number = await this.generateNumber('RECEIVED');

    return this.prisma.invoice.create({
      data: {
        number,
        direction: 'RECEIVED',
        source: data.scanned_file_url ? 'SCANNED' : 'INTERNAL',
        fournisseur_id: data.fournisseur_id || undefined,
        project_id: data.project_id,
        created_by: createdBy,
        scanned_file_url: data.scanned_file_url,
        ocr_raw_data: data.ocr_raw_data,
        issue_date: data.issue_date || new Date(),
        due_date: data.due_date,
        total_ht_brut: data.total_ht_brut,
        total_ht_net: data.total_ht_brut,
        tva_amount: data.tva_amount,
        total_ttc: data.total_ttc,
        balance: data.total_ttc,
        notes: data.notes,
        lines: data.lines ? {
          create: data.lines.map((l, i) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            total_ht: l.quantity * l.unit_price,
            order: i,
          })),
        } : undefined,
      },
      include: { fournisseur: true, lines: true },
    });
  }

  async findAll(params?: {
    direction?: InvoiceDirection;
    status?: InvoiceStatus;
    client_id?: string;
    fournisseur_id?: string;
    month?: number;
    year?: number;
    search?: string;
    page?: number;
  }) {
    const page = params?.page || 1;
    const limit = 50;
    const where: any = {};

    if (params?.direction) where.direction = params.direction;
    if (params?.status) where.status = params.status;
    if (params?.client_id) where.client_id = params.client_id;
    if (params?.fournisseur_id) where.fournisseur_id = params.fournisseur_id;
    if (params?.search) where.number = { contains: params.search, mode: 'insensitive' };

    // Dossier mensuel
    if (params?.month && params?.year) {
      const startOfMonth = new Date(params.year, params.month - 1, 1);
      const endOfMonth = new Date(params.year, params.month, 0, 23, 59, 59);
      where.issue_date = { gte: startOfMonth, lte: endOfMonth };
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          client: { select: { commercial_name: true } },
          fournisseur: { select: { name: true } },
          bl: { select: { number: true } },
          _count: { select: { payments: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { order: 'asc' } },
        client: true,
        fournisseur: true,
        bl: { select: { number: true, id: true } },
        bc: { select: { number: true, id: true } },
        payments: { orderBy: { date: 'desc' } },
        creator: { select: { first_name: true, last_name: true } },
        signature: true,
      },
    });
    if (!invoice) throw new NotFoundException('Facture non trouvée');
    return invoice;
  }

  async markAsPaid(id: string, paymentData: { type: string; amount: number; reference?: string; date?: Date }) {
    const invoice = await this.findOne(id);
    const newAmountPaid = Number(invoice.amount_paid) + paymentData.amount;
    const newBalance = Number(invoice.total_ttc) - newAmountPaid;

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          type: paymentData.type as any,
          direction: invoice.direction === 'ISSUED' ? 'IN' : 'OUT',
          amount: paymentData.amount,
          date: paymentData.date || new Date(),
          invoice_id: id,
          fournisseur_id: invoice.fournisseur_id,
          reference: paymentData.reference,
          has_invoice: true,
          created_by: invoice.created_by,
        },
      });

      return tx.invoice.update({
        where: { id },
        data: {
          amount_paid: newAmountPaid,
          balance: newBalance,
          status: newBalance <= 0 ? 'PAID' : 'PARTIAL',
          paid_at: newBalance <= 0 ? new Date() : undefined,
        },
      });
    });
  }

  async cancel(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'PAID') {
      throw new BadRequestException('Une facture payée ne peut pas être annulée');
    }
    return this.prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /**
   * Dashboard KPIs
   */
  async getStats(month?: number, year?: number) {
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();
    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59);

    const monthWhere = { issue_date: { gte: startOfMonth, lte: endOfMonth } };

    const [totalIssued, totalPaid, totalUnpaid, totalOverdue, tvaCollected] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { direction: 'ISSUED', status: { not: 'CANCELLED' }, ...monthWhere },
        _sum: { total_ttc: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { direction: 'ISSUED', status: 'PAID', ...monthWhere },
        _sum: { total_ttc: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { direction: 'ISSUED', status: { in: ['SENT', 'PARTIAL'] }, ...monthWhere },
        _sum: { balance: true },
        _count: true,
      }),
      this.prisma.invoice.count({
        where: { direction: 'ISSUED', status: 'OVERDUE', ...monthWhere },
      }),
      this.prisma.invoice.aggregate({
        where: { direction: 'ISSUED', status: { not: 'CANCELLED' }, ...monthWhere },
        _sum: { tva_amount: true },
      }),
    ]);

    return {
      ca_month: Number(totalIssued._sum.total_ttc || 0),
      invoices_count: totalIssued._count,
      paid_count: totalPaid._count,
      paid_amount: Number(totalPaid._sum.total_ttc || 0),
      unpaid_count: totalUnpaid._count,
      unpaid_amount: Number(totalUnpaid._sum.balance || 0),
      overdue_count: totalOverdue,
      tva_collected: Number(tvaCollected._sum.tva_amount || 0),
    };
  }
  async updateStatus(id: string, status: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Facture non trouvee');
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Facture annulee non modifiable');
    const data: any = { status };
    if (status === 'PAID') {
      data.balance = 0;
      data.paid_at = new Date();
    }
    if (status === 'SENT') {
      data.balance = invoice.total_ttc;
    }
    return this.prisma.invoice.update({ where: { id }, data });
  }

  async updateScan(id: string, scanned_file_url: string | null) {
    return this.prisma.invoice.update({ where: { id }, data: { scanned_file_url } });
  }
}
