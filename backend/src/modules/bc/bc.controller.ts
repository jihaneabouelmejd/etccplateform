import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, BCStatus } from '@prisma/client';
import { BCService } from './bc.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('bc')
@Controller('bc')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireModule('bc')
@ApiBearerAuth()
export class BCController {
  constructor(private readonly bc: BCService) {}

  @Post('from-devis/:devisId')
  @Roles(Role.ADMIN, Role.GERANT)
  createFromDevis(
    @Param('devisId') devisId: string,
    @CurrentUser('id') userId: string,
    @Body('signature_id') signatureId?: string,
  ) {
    return this.bc.createFromDevis(devisId, userId, signatureId || undefined);
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.GERANT)
  importBC(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.bc.importBC(data, userId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.GERANT, Role.EMPLOYE)
  findAll(
    @Query('status') status?: BCStatus,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('prestation_id') prestationId?: string,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('allowed_modules') allowedModules?: string[],
  ) {
    const hasFullAccess = role === Role.ADMIN || role === Role.GERANT
      || (role === Role.EMPLOYE && allowedModules?.includes('bc'));
    const createdBy = hasFullAccess ? undefined : userId;
    return this.bc.findAll({ status, search, page, limit, created_by: createdBy, prestation_id: prestationId });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  findOne(@Param('id') id: string) { return this.bc.findOne(id); }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  update(@Param('id') id: string, @Body() data: { number?: string; issue_date?: string; prestation_id?: string | null }) {
    return this.bc.update(id, data);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.GERANT)
  updateStatus(@Param('id') id: string, @Body('status') status: BCStatus) {
    return this.bc.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  cancel(@Param('id') id: string) { return this.bc.cancel(id); }

  @Delete(':id/permanent')
  @Roles(Role.ADMIN, Role.GERANT)
  hardDelete(@Param('id') id: string) { return this.bc.hardDelete(id); }
}
