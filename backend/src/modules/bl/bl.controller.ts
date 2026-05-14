import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, BLStatus } from '@prisma/client';
import { BLService } from './bl.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('bl')
@Controller('bl')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BLController {
  constructor(private readonly bl: BLService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GERANT)
  create(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.bl.create(data, userId);
  }

  @Post('from-devis/:devisId')
  @Roles(Role.ADMIN, Role.GERANT)
  createFromDevis(
    @Param('devisId') devisId: string,
    @CurrentUser('id') userId: string,
    @Body('signature_id') signatureId?: string,
  ) {
    return this.bl.createFromDevis(devisId, userId, signatureId || undefined);
  }

  @Get()
  @Roles(Role.ADMIN, Role.GERANT, Role.EMPLOYE)
  findAll(
    @Query('status') status?: BLStatus,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    const createdBy = (role === Role.ADMIN || role === Role.GERANT) ? undefined : userId;
    return this.bl.findAll({ status, search, page, created_by: createdBy });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  findOne(@Param('id') id: string) { return this.bl.findOne(id); }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.GERANT)
  updateStatus(@Param('id') id: string, @Body('status') status: BLStatus) {
    return this.bl.updateStatus(id, status);
  }

  @Patch(':id/signed-scan')
  @Roles(Role.ADMIN, Role.GERANT)
  saveSignedScan(@Param('id') id: string, @Body('signed_scan_url') url: string) {
    return this.bl.saveSignedScan(id, url);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  remove(@Param('id') id: string) { return this.bl.remove(id); }
}
