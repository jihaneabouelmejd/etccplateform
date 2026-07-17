import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectStatus } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Générer un code projet unique : ETCC-2026-001
   */
  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const lastProject = await this.prisma.project.findFirst({
      where: { code: { startsWith: `ETCC-${year}` } },
      orderBy: { code: 'desc' },
    });

    let seq = 1;
    if (lastProject) {
      const parts = lastProject.code.split('-');
      seq = parseInt(parts[2], 10) + 1;
    }

    return `ETCC-${year}-${seq.toString().padStart(3, '0')}`;
  }

  private validIds(ids: any): string[] {
    return Array.isArray(ids)
      ? ids.filter((uid) => typeof uid === 'string' && uid.trim().length > 0)
      : [];
  }

  async create(data: {
    name: string;
    description?: string;
    client_id: string;
    budget_amount: number;
    start_date?: Date;
    end_date?: Date;
    address?: string;
    city?: string;
    assignee_ids?: string[];
  }, createdBy: string) {
    const code = await this.generateCode();
    const assigneeIds = this.validIds(data.assignee_ids);

    return this.prisma.project.create({
      data: {
        code,
        name: data.name,
        description: data.description,
        client_id: data.client_id,
        budget_amount: data.budget_amount,
        start_date: data.start_date,
        end_date: data.end_date,
        address: data.address,
        city: data.city,
        created_by: createdBy,
        assignments: assigneeIds.length
          ? { create: assigneeIds.map((uid) => ({ user_id: uid })) }
          : undefined,
      },
      include: {
        client: { select: { commercial_name: true } },
        assignments: { include: { user: { select: { id: true, first_name: true, last_name: true, avatar_url: true, role: true } } } },
      },
    });
  }

  async findAll(params?: {
    status?: ProjectStatus;
    client_id?: string;
    search?: string;
    page?: number;
    limit?: number;
    user_id?: string;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = {};

    if (params?.status) where.status = params.status;
    if (params?.client_id) where.client_id = params.client_id;
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params?.user_id) {
      where.assignments = { some: { user_id: params.user_id } };
    }

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          client: { select: { commercial_name: true } },
          tasks: { select: { status: true, progress: true } },
          assignments: { include: { user: { select: { id: true, first_name: true, last_name: true, avatar_url: true, role: true } } } },
          _count: { select: { tasks: true, devis: true, bls: true, invoices: true, expenses: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    // Enrichir avec avancement moyen
    const enriched = data.map((p) => {
      const taskCount = p.tasks.length;
      const avgProgress = taskCount > 0
        ? Math.round(p.tasks.reduce((s, t) => s + t.progress, 0) / taskCount)
        : 0;

      return { ...p, avg_progress: avgProgress, tasks: undefined };
    });

    return { data: enriched, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        tasks: {
          include: { assignments: { include: { user: { select: { first_name: true, last_name: true } } } } },
          orderBy: { created_at: 'desc' },
        },
        devis: { orderBy: { created_at: 'desc' }, take: 10 },
        bls: { orderBy: { created_at: 'desc' }, take: 10 },
        invoices: { orderBy: { created_at: 'desc' }, take: 10 },
        expenses: { orderBy: { created_at: 'desc' }, take: 10 },
        photos: { orderBy: { uploaded_at: 'desc' } },
        assignments: { include: { user: { select: { id: true, first_name: true, last_name: true, avatar_url: true, role: true } } } },
        _count: { select: { tasks: true, devis: true, bcs: true, bls: true, invoices: true, expenses: true } },
      },
    });

    if (!project) throw new NotFoundException('Chantier non trouvé');
    return project;
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    const updateData: any = {};
    if (data.name        !== undefined) updateData.name         = data.name;
    if (data.city        !== undefined) updateData.city         = data.city;
    if (data.description !== undefined) updateData.description  = data.description;
    if (data.status      !== undefined) updateData.status       = data.status;
    if (data.progress    !== undefined) updateData.progress     = Number(data.progress);
    if (data.budget_amount !== undefined) updateData.budget_amount = data.budget_amount;
    if (data.start_date  !== undefined) updateData.start_date   = data.start_date ? new Date(data.start_date) : null;
    if (data.end_date    !== undefined) updateData.end_date     = data.end_date   ? new Date(data.end_date)   : null;
    if (data.client_id   !== undefined) updateData.client_id    = data.client_id;
    if (data.address     !== undefined) updateData.address      = data.address;

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.project.update({ where: { id }, data: updateData });
      }

      if (data.assignee_ids !== undefined) {
        const validIds = this.validIds(data.assignee_ids);
        await tx.projectAssignment.deleteMany({ where: { project_id: id } });
        if (validIds.length > 0) {
          await tx.projectAssignment.createMany({
            data: validIds.map((uid) => ({ project_id: id, user_id: uid })),
            skipDuplicates: true,
          });
        }
      }

      return tx.project.findUnique({
        where: { id },
        include: {
          client: { select: { commercial_name: true } },
          assignments: { include: { user: { select: { id: true, first_name: true, last_name: true, avatar_url: true, role: true } } } },
        },
      });
    });
  }

  async updateStatus(id: string, status: ProjectStatus) {
    const data: any = { status };
    if (status === 'COMPLETED') data.completed_at = new Date();
    return this.prisma.project.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.projectAssignment.deleteMany({ where: { project_id: id } });
    return this.prisma.project.delete({ where: { id } });
  }

  /**
   * Dashboard KPIs
   */
  async getStats() {
    const [total, active, late, completed] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.project.count({ where: { status: 'ACTIVE' } }),
      this.prisma.project.count({ where: { status: 'LATE' } }),
      this.prisma.project.count({ where: { status: 'COMPLETED' } }),
    ]);

    const projects = await this.prisma.project.findMany({
      where: { status: { in: ['ACTIVE', 'LATE'] } },
      select: { budget_amount: true, actual_amount: true },
    });

    const totalBudget = projects.reduce((s, p) => s + Number(p.budget_amount), 0);
    const totalSpent = projects.reduce((s, p) => s + Number(p.actual_amount), 0);

    return {
      total,
      active,
      late,
      completed,
      total_budget: totalBudget,
      total_spent: totalSpent,
      budget_consumption: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
    };
  }
}
