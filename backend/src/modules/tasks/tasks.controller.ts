import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/** Roles autorisés à voir toutes les tâches / gérer les assignations */
const ADMIN_ROLES = ['ADMIN', 'GERANT'];

function isAdmin(role: string) {
  return ADMIN_ROLES.includes(role);
}

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  async create(
    @Body() data: any,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    try {
      if (!data?.project_id) {
        throw new (require('@nestjs/common').BadRequestException)('project_id est requis');
      }
      if (!data?.title) {
        throw new (require('@nestjs/common').BadRequestException)('title est requis');
      }
      const payload = { ...data };
      if (!isAdmin(role)) {
        payload.assignee_ids = [userId];
      }
      return await this.tasks.create(payload, userId);
    } catch (e: any) {
      console.error('[TaskCreate] userId=%s error=%s data=%j', userId, e?.message, data);
      throw e;
    }
  }

  @Get()
  findAll(
    @Query('project_id') projectId?: string,
    @Query('status') status?: TaskStatus,
    @Query('my_tasks') myTasks?: string,
    @Query('filter_user_id') filterUserId?: string,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    let effectiveUserId: string | undefined;

    if (!isAdmin(role!)) {
      // Non-admin : toujours filtré par leur propre userId (sécurité backend)
      effectiveUserId = userId;
    } else {
      // Admin/Gérant : contrôle total
      if (myTasks === 'true') {
        effectiveUserId = userId;
      } else if (filterUserId) {
        effectiveUserId = filterUserId;
      }
      // Sinon undefined → toutes les tâches
    }

    return this.tasks.findAll({
      project_id: projectId,
      status,
      user_id: effectiveUserId,
    });
  }

  @Get('stats')
  getStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query('all') all?: string,
    @Query('filter_user_id') filterUserId?: string,
  ) {
    if (!isAdmin(role)) {
      // Non-admin : stats de ses propres tâches uniquement
      return this.tasks.getStats(userId);
    }
    // Admin : all=true → toutes, sinon filtre par user ou soi-même
    if (all === 'true') return this.tasks.getStats(undefined);
    return this.tasks.getStats(filterUserId || userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser('id') userId: string, @CurrentUser('role') role: string) {
    const task = await this.tasks.findOne(id);
    if (!isAdmin(role)) {
      const assigned = task.assignments?.some((a: any) => a.user?.id === userId || a.user_id === userId);
      if (!assigned) throw new ForbiddenException('Accès refusé à cette tâche');
    }
    return task;
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: TaskStatus; progress?: number },
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    if (!isAdmin(role)) {
      const task = await this.tasks.findOne(id);
      const assigned = task.assignments?.some((a: any) => a.user?.id === userId || a.user_id === userId);
      if (!assigned) throw new ForbiddenException('Non autorisé');
    }
    return this.tasks.updateStatus(id, body.status, body.progress);
  }

  @Patch(':id/progress')
  async updateProgress(
    @Param('id') id: string,
    @Body('progress') progress: number,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    if (!isAdmin(role)) {
      const task = await this.tasks.findOne(id);
      const assigned = task.assignments?.some((a: any) => a.user?.id === userId || a.user_id === userId);
      if (!assigned) throw new ForbiddenException('Non autorisé');
    }
    return this.tasks.updateProgress(id, progress);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.tasks.addComment(id, userId, body.content, body.photo_url);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: any,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    if (!isAdmin(role)) {
      const task = await this.tasks.findOne(id);
      const assigned = task.assignments?.some((a: any) => a.user?.id === userId || a.user_id === userId);
      if (!assigned) throw new ForbiddenException('Non autorisé');
      // Non-admin ne peut pas changer les assignations
      delete data.assignee_ids;
    }
    return this.tasks.update(id, data);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser('role') role: string,
  ) {
    if (!isAdmin(role)) throw new ForbiddenException('Seul un admin ou gérant peut supprimer une tâche');
    return this.tasks.remove(id);
  }
}
