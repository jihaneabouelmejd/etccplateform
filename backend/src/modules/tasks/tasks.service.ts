import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    project_id: string;
    title: string;
    description?: string;
    due_date?: Date;
    priority?: number;
    assignee_ids?: string[];
  }, createdBy: string) {
    const task = await this.prisma.task.create({
      data: {
        project_id: data.project_id,
        title: data.title,
        description: data.description || undefined,
        due_date: data.due_date ? new Date(data.due_date) : undefined,
        priority: Number(data.priority) || 0,
        status: (data as any).status || 'TODO',
        progress: Number((data as any).progress) || 0,
        assignments: data.assignee_ids?.length
          ? {
              create: data.assignee_ids.map((uid) => ({ user_id: uid })),
            }
          : undefined,
      },
      include: {
        assignments: { include: { user: { select: { first_name: true, last_name: true, avatar_url: true } } } },
        project: { select: { name: true, code: true } },
      },
    });
    return task;
  }

  async findAll(params?: {
    project_id?: string;
    user_id?: string;
    status?: TaskStatus;
    page?: number;
  }) {
    const page = params?.page || 1;
    const limit = 100;
    const where: any = {};
    if (params?.project_id) where.project_id = params.project_id;
    if (params?.status) where.status = params.status;
    if (params?.user_id) {
      where.assignments = { some: { user_id: params.user_id } };
    }

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
        include: {
          assignments: {
            include: { user: { select: { first_name: true, last_name: true, avatar_url: true } } },
          },
          project: { select: { name: true, code: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    // Group by status pour le Kanban
    const kanban = {
      TODO: data.filter((t) => t.status === 'TODO'),
      IN_PROGRESS: data.filter((t) => t.status === 'IN_PROGRESS'),
      BLOCKED: data.filter((t) => t.status === 'BLOCKED'),
      DONE: data.filter((t) => t.status === 'DONE'),
    };

    return { data, kanban, meta: { total, page, limit } };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignments: {
          include: { user: { select: { id: true, first_name: true, last_name: true } } },
        },
        comments: {
          orderBy: { created_at: 'asc' },
          include: { task: { select: { title: true } } },
        },
        project: { select: { name: true, code: true, client_id: true } },
      },
    });
    if (!task) throw new NotFoundException('Tâche non trouvée');
    return task;
  }

  async updateStatus(id: string, status: TaskStatus, progress?: number) {
    const data: any = { status };
    if (progress !== undefined) data.progress = progress;
    if (status === 'DONE') {
      data.progress = 100;
      data.completed_at = new Date();
    }
    return this.prisma.task.update({ where: { id }, data });
  }

  async updateProgress(id: string, progress: number) {
    const status = progress >= 100 ? 'DONE' : progress > 0 ? 'IN_PROGRESS' : 'TODO';
    return this.prisma.task.update({
      where: { id },
      data: {
        progress,
        status: status as TaskStatus,
        completed_at: progress >= 100 ? new Date() : null,
      },
    });
  }

  async addComment(taskId: string, userId: string, content: string, photoUrl?: string) {
    return this.prisma.taskComment.create({
      data: { task_id: taskId, user_id: userId, content, photo_url: photoUrl },
    });
  }

  async getStats(userId?: string) {
    const where = userId
      ? { assignments: { some: { user_id: userId } } }
      : {};

    const [todo, inProgress, blocked, done] = await Promise.all([
      this.prisma.task.count({ where: { ...where, status: 'TODO' } }),
      this.prisma.task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      this.prisma.task.count({ where: { ...where, status: 'BLOCKED' } }),
      this.prisma.task.count({ where: { ...where, status: 'DONE' } }),
    ]);

    return { todo, in_progress: inProgress, blocked, done, total: todo + inProgress + blocked + done };
  }

  async update(id: string, data: {
    title?: string;
    description?: string;
    due_date?: string | Date | null;
    priority?: number;
    status?: TaskStatus;
    progress?: number;
    assignee_ids?: string[];
  }) {
    // Build the scalar-only update payload (no nested relations)
    const updateData: any = {};
    if (data.title       !== undefined) updateData.title       = data.title;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.priority    !== undefined) updateData.priority    = Number(data.priority);
    if (data.status      !== undefined) updateData.status      = data.status;
    if (data.progress    !== undefined) updateData.progress    = Number(data.progress);

    // due_date: empty string → null (clear the date), ISO string → Date
    if (data.due_date !== undefined) {
      if (!data.due_date || data.due_date === '') {
        updateData.due_date = null;
      } else {
        updateData.due_date = new Date(data.due_date as string);
      }
    }

    /**
     * Use an interactive transaction to:
     *  1. Update task scalar fields
     *  2. Replace assignments atomically (delete-then-createMany)
     *  3. Return the full task with relations via a final findUnique
     *
     * We intentionally separate the assignment operations from the task.update()
     * call to avoid PrismaClientValidationError caused by mixing nested-write
     * (data.assignments.create) with include (include.assignments) in the same
     * update query inside a transaction context.
     */
    return this.prisma.$transaction(async (tx) => {
      // Step 1 — update scalar fields
      await tx.task.update({ where: { id }, data: updateData });

      // Step 2 — replace assignments if provided
      if (data.assignee_ids !== undefined) {
        await tx.taskAssignment.deleteMany({ where: { task_id: id } });

        if (data.assignee_ids.length > 0) {
          await tx.taskAssignment.createMany({
            data: data.assignee_ids.map((userId) => ({ task_id: id, user_id: userId })),
            skipDuplicates: true,  // safety net against duplicates
          });
        }
      }

      // Step 3 — return fresh task with all relations
      return tx.task.findUnique({
        where: { id },
        include: {
          assignments: {
            include: { user: { select: { id: true, first_name: true, last_name: true } } },
          },
          project: { select: { name: true, code: true } },
        },
      });
    });
  }

  async remove(id: string) {
    await this.prisma.taskAssignment.deleteMany({ where: { task_id: id } });
    await this.prisma.taskComment.deleteMany({ where: { task_id: id } });
    return this.prisma.task.delete({ where: { id } });
  }
}
