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
  create(
    @Body() data: any,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // Non-admins ne peuvent créer que pour eux-mêmes
    const payload = { ...data };
    if (!isAdmin(role)) {
      payload.assignee_ids = [userId];
    }
    return this.tasks.create(payload, userId);
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
    @Curre