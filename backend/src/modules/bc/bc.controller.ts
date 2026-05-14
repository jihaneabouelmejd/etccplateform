import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, BCStatus } from '@prisma/client';
import { BCService } from './bc.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('bc')
@Controller('bc')
@UseGuards(JwtAuthGuard, RolesGuard)
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
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    const createdBy = (role === Role.ADMIN || role === Role.GERANT) ? undefined : userId;
    return this.bc.findAll({ status, search, page, created_by: createdBy });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  findOne(@Param('id') id: string) { return this.bc.findOne(id); }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.GERANT)
  updateStatus(@Param('id') id: string, @Body('status') status: BCStatus) {
    return this.bc.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  cancel(@Param('id') id: string) { return this.bc.cancel(id); }
}
