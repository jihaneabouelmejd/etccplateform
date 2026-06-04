import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpenseCategory, ExpenseStatus, PaymentType } from '@prisma/client';

@Injectable()
export class DepensesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    project_id?: string;
    prestation_id?: string;
    prestation_nom?: string;
    category: ExpenseCategory;
    payment_method?: string;
    amount: number;
    tva_amount?: number;
    date?: Date;
    description: string;
    notes?: string;
    receipt_url?: string;
  }, submittedBy: string) {
    if (!data.description?.trim()) throw new BadRequestException('La description est obligatoire');
    if (data.amount == null || isNaN(data.amount) || data.amount <= 0) throw new BadRequestException('Montant invalide');
    if (!data.category) throw new BadRequestException('La catégorie est obligatoire');
    try {
    return this.prisma.expense.create({
      data: {
        project_id:     data.project_id || null,
        prestation_id:  data.prestation_id || null,
        prestation_nom: data.prestation_nom || null,
        category:       data.category,
        amount:         data.amount,
        tva_amount:     data.tva_amount ?? null,
        date:           data.date ?? new Date(),
        description:    data.description,
        notes:          data.notes ?? null,
        payment_method: (data.payment_method as PaymentType) ?? null,
        receipt_url:    data.receipt_url ?? null,
        has_receipt:    !!data.receipt_url,
        submitted_by:   submittedBy,
        status:         'PENDING',
      } as any,
      include: {
        project: { select: { name: true, code: true } },
        submitter: { select: { first_name: true, last_name: true } },
      },
    });
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException('Erreur lors de la création de la dépense: ' + (err?.message || ''));
    }
  }

  async findAll(params?: {
    status?: ExpenseStatus; category?: ExpenseCategory;
    project_id?: string; prestation_id?: string; submitted_by?: string;
    month?: number; year?: number; page?: number; limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = {};

    if (params?.status) where.status = params.status;
    if (params?.category) where.category = params.category;
    if (params?.project_id) where.project_id = params.project_id;
    if (params?.prestation_id) where.prestation_id = params.prestation_id;
    if (params?.submitted_by) where.submitted_by = params.submitted_by;

    if (params?.month && params?.year) {
      const start = new Date(params.year, params.month - 1, 1);
      const end = new Date(params.year, params.month, 0, 23, 59, 59);
      where.date = { gte: start, lte: end };
    }

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          project: { select: { name: true, code: true } },
          submitter: { select: { first_name: true, last_name: true } },
          approver: { select: { first_name: true, last_name: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const e = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        project: true,
        submitter: { select: { first_name: true, last_name: true, phone: true } },
        approver: { select: { first_name: true, last_name: true } },
      },
    });
    if (!e) throw new NotFoundException('Dépense non trouvée');
    return e;
  }

  async update(id: string, data: any) {
    const updateData: any = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.payment_method !== undefined) updateData.payment_method = data.payment_method;
    if (data.project_id !== undefined) updateData.project_id = data.project_id || null;
    if (data.prestation_id !== undefined) updateData.prestation_id = data.prestation_id || null;
    if (data.prestation_nom !== undefined) updateData.prestation_nom = data.prestation_nom || null;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.payment_method !== undefined) updateData.payment_method = data.payment_method as PaymentType || null;
    if (data.notes !== undefined) updateData.notes = data.notes || null;
    if (data.receipt_url !== undefined) {
      updateData.receipt_url = data.receipt_url || null;
      updateData.has_receipt = !!data.receipt_url;
    }
    return this.prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { name: true, code: true } },
        submitter: { select: { first_name: true, last_name: true } },
      },
    });
  }

  async delete(id: string) {
    return this.prisma.expense.delete({ where: { id } });
  }

  async approve(id: string, approvedBy: string) {
    const expense = await this.findOne(id);
    if (expense.status !== 'PENDING') {
      throw new BadRequestException('Cette dépense a déjà été traitée');
    }
    return this.prisma.expense.update({
      where: { id },
      data: { status: 'APPROVED', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  async reject(id: string, reason: string) {
    const expense = await this.findOne(id);
    if (expense.status !== 'PENDING') {
      throw new BadRequestException('Cette dépense a déjà été traitée');
    }
    return this.prisma.expense.update({
      where: { id },
      data: { status: 'REJECTED', rejection_reason: reason },
    });
  }

  async bulkApprove(ids: string[], approvedBy: string) {
    return this.prisma.expense.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'APPROVED', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  async getStats(month?: number, year?: number) {
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    const where = { date: { gte: start, lte: end } };

    const [total, pending, approved, rejected, byCategory] = await Promise.all([
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
      this.prisma.expense.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.expense.aggregate({ where: { ...where, status: 'APPROVED' }, _sum: { amount: true } }),
      this.prisma.expense.count({ where: { ...where, status: 'REJECTED' } }),
      this.prisma.expense.groupBy({
        by: ['category'], where,
        _sum: { amount: true }, _count: true,
      }),
    ]);

    return {
      total_amount: Number(total._sum.amount || 0),
      total_count: total._count,
      pending_count: pending,
      approved_amount: Number(approved._sum.amount || 0),
      rejected_count: rejected,
      by_category: byCategory.map((c) => ({
        category: c.category,
        amount: Number(c._sum.amount || 0),
        count: c._count,
      })),
    };
  }
}