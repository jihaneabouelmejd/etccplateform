import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, ExpenseStatus, ExpenseCategory } from '@prisma/client';
import { DepensesService } from './depenses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('depenses')
@Controller('depenses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DepensesController {
  constructor(private readonly depenses: DepensesService) {}

  @Post()
  create(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.depenses.create(data, userId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  findAll(
    @Query('status') status?: ExpenseStatus,
    @Query('category') category?: ExpenseCategory,
    @Query('project_id') projectId?: string,
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Query('page') page?: number,
  ) {
    return this.depenses.findAll({ status, category, project_id: projectId, month, year, page });
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  getStats(@Query('month') month?: number, @Query('year') year?: number) {
    return this.depenses.getStats(month, year);
  }

  @Get('my')
  findMine(@CurrentUser('id') userId: string, @Query('page') page?: number) {
    return this.depenses.findAll({ submitted_by: userId, page });
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.depenses.findOne(id); }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  approve(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.depenses.approve(id, userId);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.depenses.reject(id, reason);
  }

  @Post('bulk-approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  bulkApprove(@Body('ids') ids: string[], @CurrentUser('id') userId: string) {
    return this.depenses.bulkApprove(ids, userId);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.depenses.update(id, data);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  remove(@Param('id') id: string) {
    return this.depenses.delete(id);
  }

}
