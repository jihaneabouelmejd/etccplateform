import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RapprochementService } from './rapprochement.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('rapprochement')
@Controller('rapprochement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
@RequireModule('comptabilite')
@ApiBearerAuth()
export class RapprochementController {
  constructor(private readonly rapprochement: RapprochementService) {}

  @Post('import')
  import(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.rapprochement.importStatement({
      csvContent: data.csv_content,
      bank_name: data.bank_name,
      account: data.account,
      period_from: new Date(data.period_from),
      period_to: new Date(data.period_to),
    }, userId);
  }


  @Post('import-scan')
  importScan(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.rapprochement.importScan({
      file_url: data.file_url,
      bank_name: data.bank_name,
      account: data.account,
      period_from: new Date(data.period_from || Date.now()),
      period_to: new Date(data.period_to || Date.now()),
    }, userId);
  }

  @Get('statements')
  getStatements(@Query('page') page?: string) {
    return this.rapprochement.getStatements(page ? parseInt(page, 10) : 1);
  }

  @Delete('statements/:id')
  deleteStatement(@Param('id') id: string) {
    return this.rapprochement.deleteStatement(id);
  }

  @Get('statements/:id/lines')
  getLines(@Param('id') id: string, @Query('status') status?: string) {
    return this.rapprochement.getStatementLines(id, status);
  }

  @Get('statements/:id/summary')
  getSummary(@Param('id') id: string) {
    return this.rapprochement.getSummary(id);
  }

  @Patch('lines/:id/confirm')
  confirmMatch(
    @Param('id') id: string,
    @Body('invoice_id') invoiceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.rapprochement.confirmMatch(id, invoiceId, userId);
  }

  @Patch('lines/:id/no-invoice')
  markNoInvoice(@Param('id') id: string, @Body('justification') justification?: string) {
    return this.rapprochement.markNoInvoice(id, justification);
  }

}
