import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, DevisStatus } from '@prisma/client';
import { DevisService } from './devis.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('devis')
@Controller('devis')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireModule('devis')
@ApiBearerAuth()
export class DevisController {
  constructor(private readonly devis: DevisService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GERANT)
  create(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.devis.create(data, userId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.GERANT, Role.EMPLOYE)
  findAll(
    @Query('status') status?: DevisStatus,
    @Query('statuses') statuses?: string,
    @Query('client_id') clientId?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('prestation_id') prestationId?: string,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('allowed_modules') allowedModules?: string[],
  ) {
    const statusesArr = statuses ? (statuses.split(',') as DevisStatus[]) : undefined;
    const hasFullAccess = role === Role.ADMIN || role === Role.GERANT
      || (role === Role.EMPLOYE && allowedModules?.includes('devis'));
    const createdBy = hasFullAccess ? undefined : userId;
    return this.devis.findAll({ status, statuses: statusesArr, client_id: clientId, search, page, limit, created_by: createdBy, prestation_id: prestationId });
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.GERANT)
  getStats() { return this.devis.getStats(); }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  findOne(@Param('id') id: string) { return this.devis.findOne(id); }

  @Get(':id/lines-for-bl')
  @Roles(Role.ADMIN, Role.GERANT)
  getLinesForBL(@Param('id') id: string) { return this.devis.getLinesForBL(id); }

  @Get(':id/lines-for-invoice')
  @Roles(Role.ADMIN, Role.GERANT)
  getLinesForInvoice(@Param('id') id: string) { return this.devis.getLinesForInvoice(id); }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  update(@Param('id') id: string, @Body() data: any) { return this.devis.update(id, data); }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.GERANT)
  updateStatus(@Param('id') id: string, @Body('status') status: DevisStatus) {
    return this.devis.updateStatus(id, status);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.GERANT)
  duplicate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.devis.duplicate(id, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  remove(@Param('id') id: string) { return this.devis.remove(id); }

  @Patch(':id/restore')
  @Roles(Role.ADMIN, Role.GERANT)
  restore(@Param('id') id: string) { return this.devis.restore(id); }

  @Delete(':id/hard')
  @Roles(Role.ADMIN, Role.GERANT)
  hardDelete(@Param('id') id: string) { return this.devis.hardDelete(id); }
}
