import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AlertesService } from './alertes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('alertes')
@Controller('alerts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AlertesController {
  constructor(private readonly alertes: AlertesService) {}

  @Get()
  findAll(@Query('status') status?: string, @Query('type') type?: string) {
    return this.alertes.findAll({ status, type });
  }

  @Get('stats')
  getStats() { return this.alertes.getStats(); }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('note') note?: string) {
    return this.alertes.resolve(id, userId, note);
  }

  @Patch(':id/acknowledge')
  acknowledge(@Param('id') id: string) { return this.alertes.acknowledge(id); }
}
