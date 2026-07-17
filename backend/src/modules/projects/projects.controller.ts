import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, ProjectStatus } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GERANT)
  async create(@Body() data: any, @CurrentUser('id') userId: string) {
    try {
      return await this.projects.create(data, userId);
    } catch (e: any) {
      console.error('[ProjectCreate] userId=%s error=%s data=%j', userId, e?.message, data);
      throw e;
    }
  }

  @Get()
  findAll(
    @Query('status') status?: ProjectStatus,
    @Query('client_id') clientId?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('user_id') userId?: string,
  ) {
    return this.projects.findAll({ status, client_id: clientId, search, page, user_id: userId });
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.GERANT)
  getStats() { return this.projects.getStats(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.projects.findOne(id); }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  async update(@Param('id') id: string, @Body() data: any) {
    try {
      return await this.projects.update(id, data);
    } catch (e: any) {
      console.error('[ProjectUpdate] id=%s error=%s data=%j', id, e?.message, data);
      throw e;
    }
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.GERANT)
  updateStatus(@Param('id') id: string, @Body('status') status: ProjectStatus) {
    return this.projects.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  remove(@Param('id') id: string) { return this.projects.remove(id); }
}
