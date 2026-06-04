import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { DettesService } from './dettes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('dettes')
export class DettesController {
  constructor(private readonly svc: DettesService) {}

  @Get()        findAll(@Query('statut') statut?: string) { return this.svc.findAll(statut); }
  @Get('stats') stats() { return this.svc.stats(); }
  @Get(':id')   findOne(@Param('id') id: string) { return this.svc.findOne(id); }
  @Post()       create(@Body() dto: any) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: any) { return this.svc.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.delete(id); }

  @Post(':id/paiements')
  addPaiement(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.svc.addPaiement(id, dto, userId);
  }

  @Delete(':id/paiements/:pid')
  delPaiement(@Param('id') id: string, @Param('pid') pid: string) {
    return this.svc.deletePaiement(id, pid);
  }
}
