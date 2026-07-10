import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, InvoiceDirection, InvoiceStatus } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('from-bl')
  @Roles(Role.ADMIN, Role.GERANT)
  createFromBL(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.invoices.createFromBL(data, userId);
  }

  @Post('purchase')
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  createPurchase(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.invoices.createPurchaseInvoice(data, userId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE, Role.EMPLOYE)
  findAll(
    @Query('direction') direction?: InvoiceDirection,
    @Query('status') status?: InvoiceStatus,
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    const createdBy = (role === Role.ADMIN || role === Role.GERANT || role === Role.COMPTABLE) ? undefined : userId;
    return this.invoices.findAll({ direction, status, month, year, search, page, limit, created_by: createdBy });
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  getStats(@Query('month') month?: number, @Query('year') year?: number) {
    return this.invoices.getStats(month, year);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  findOne(@Param('id') id: string) { return this.invoices.findOne(id); }

  @Post(':id/pay')
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  markAsPaid(@Param('id') id: string, @Body() data: any) {
    return this.invoices.markAsPaid(id, data);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  update(@Param('id') id: string, @Body() data: any) {
    return this.invoices.update(id, data);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  updateStatus(@Param('id') id: string, @Body() body: any) {
    return this.invoices.updateStatus(id, body.status);
  }

  @Patch(':id/scan')
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  updateScan(@Param('id') id: string, @Body() body: any) {
    return this.invoices.updateScan(id, body.scanned_file_url ?? null);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  cancel(@Param('id') id: string) { return this.invoices.cancel(id); }

  @Patch(':id/restore')
  @Roles(Role.ADMIN, Role.GERANT)
  restore(@Param('id') id: string) { return this.invoices.restore(id); }

  @Delete(':id/hard')
  @Roles(Role.ADMIN, Role.GERANT)
  hardDelete(@Param('id') id: string) { return this.invoices.hardDelete(id); }
}
