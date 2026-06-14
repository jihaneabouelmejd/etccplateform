import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AgendaService {
  constructor(private prisma: PrismaService) {}

  // ─── OBJECTIFS ────────────────────────────────────────────────────────────

  async createObjectif(data: {
    title: string;
    description?: string;
    project_id?: string;
    start_date?: string;
    end_date?: string;
  }, userId: string) {
    return this.prisma.objectif.create({
      data: {
        title: data.title,
        description: data.description,
        project_id: data.project_id || null,
        user_id: userId,
        start_date: data.start_date ? new Date(data.start_date) : null,
        end_date: data.end_date ? new Date(data.end_date) : null,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, first_name: true, last_name: true } },
      },
    });
  }

  async findObjectifs(params: { user_id?: string; project_id?: string; completed?: boolean }) {
    const where: any = {};
    if (params.user_id) where.user_id = params.user_id;
    if (params.project_id) where.project_id = params.project_id;
    if (params.completed !== undefined) where.completed = params.completed;

    return this.prisma.objectif.findMany({
      where,
      orderBy: [{ completed: 'asc' }, { end_date: 'asc' }, { created_at: 'desc' }],
      include: {
        project: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, first_name: true, last_name: true } },
      },
    });
  }

  async updateObjectif(id: string, data: {
    title?: string;
    description?: string;
    project_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    progress?: number;
    completed?: boolean;
  }, userId: string) {
    const objectif = await this.prisma.objectif.findUnique({ where: { id } });
    if (!objectif) throw new NotFoundException('Objectif non trouvé');

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.project_id !== undefined) updateData.project_id = data.project_id || null;
    if (data.start_date !== undefined) updateData.start_date = data.start_date ? new Date(data.start_date) : null;
    if (data.end_date !== undefined) updateData.end_date = data.end_date ? new Date(data.end_date) : null;
    if (data.progress !== undefined) updateData.progress = data.progress;
    if (data.completed !== undefined) {
      updateData.completed = data.completed;
      updateData.completed_at = data.completed ? new Date() : null;
      if (data.completed) updateData.progress = 100;
    }

    return this.prisma.objectif.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, first_name: true, last_name: true } },
      },
    });
  }

  async deleteObjectif(id: string) {
    return this.prisma.objectif.delete({ where: { id } });
  }

  // ─── AGENDA VIEW (tasks + objectifs for calendar) ─────────────────────────

  async getAgendaData(userId: string, role: string, month: number, year: number) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const isAdmin = ['ADMIN', 'GERANT'].includes(role);

    // Tasks with due_date in the month
    const taskWhere: any = {
      due_date: { gte: startOfMonth, lte: endOfMonth },
    };
    if (!isAdmin) {
      taskWhere.assignments = { some: { user_id: userId } };
    }

    const [tasks, objectifs, googleToken] = await Promise.all([
      this.prisma.task.findMany({
        where: taskWhere,
        include: {
          assignments: {
            include: { user: { select: { id: true, first_name: true, last_name: true } } },
          },
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { due_date: 'asc' },
      }),
      this.prisma.objectif.findMany({
        where: isAdmin ? {} : { user_id: userId },
        include: {
          project: { select: { id: true, name: true, code: true } },
          creator: { select: { id: true, first_name: true, last_name: true } },
        },
        orderBy: [{ completed: 'asc' }, { end_date: 'asc' }],
      }),
      this.prisma.userGoogleToken.findUnique({ where: { user_id: userId } }),
    ]);

    return {
      tasks,
      objectifs,
      google_connected: !!googleToken,
    };
  }

  // ─── GOOGLE TOKEN MANAGEMENT ──────────────────────────────────────────────

  async saveGoogleToken(userId: string, tokens: {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
    scope?: string;
  }) {
    return this.prisma.userGoogleToken.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expiry_date: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
        scope: tokens.scope || null,
      },
      update: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || undefined,
        expiry_date: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
        scope: tokens.scope || null,
        updated_at: new Date(),
      },
    });
  }

  async getGoogleToken(userId: string) {
    return this.prisma.userGoogleToken.findUnique({ where: { user_id: userId } });
  }

  async deleteGoogleToken(userId: string) {
    return this.prisma.userGoogleToken.delete({ where: { user_id: userId } }).catch(() => null);
  }

  async getTasksForSync(userId: string, role: string) {
    const isAdmin = ['ADMIN', 'GERANT'].includes(role);
    const where: any = { due_date: { not: null } };
    if (!isAdmin) {
      where.assignments = { some: { user_id: userId } };
    }
    return this.prisma.task.findMany({
      where,
      include: {
        project: { select: { name: true, code: true } },
        assignments: { include: { user: { select: { first_name: true, last_name: true } } } },
      },
    });
  }

  async updateTaskGoogleEventId(taskId: string, googleEventId: string | null) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { google_event_id: googleEventId },
    });
  }
}
