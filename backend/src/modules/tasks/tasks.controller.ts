import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.tasks.create(data, userId);
  }

  @Get()
  findAll(
    @Query('project_id') projectId?: string,
    @Query('status') status?: TaskStatus,
    @Query('my_tasks') myTasks?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.tasks.findAll({
      project_id: projectId,
      status,
      user_id: myTasks === 'true' ? userId : undefined,
    });
  }

  @Get('stats')
  getStats(@CurrentUser('id') userId: string, @Query('all') all?: string) {
    return this.tasks.getStats(all === 'true' ? undefined : userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.tasks.findOne(id); }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: TaskStatus; progress?: number }) {
    return this.tasks.updateStatus(id, body.status, body.progress);
  }

  @Patch(':id/progress')
  updateProgress(@Param('id') id: string, @Body('progress') progress: number) {
    return this.tasks.updateProgress(id, progress);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.tasks.addComment(id, userId, body.content, body.photo_url);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.tasks.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tasks.remove(id);
  }
}
