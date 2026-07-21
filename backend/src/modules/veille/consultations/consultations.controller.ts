import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, AnnonceStatus } from '@prisma/client';
import { ConsultationsService } from './consultations.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireModule } from '../../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('veille-consultations')
@Controller('veille/consultations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.GERANT, Role.EMPLOYE)
@RequireModule('veille')
@ApiBearerAuth()
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @Get()
  search(
    @Query('q') q?: string,
    @Query('entreprise_id') entrepriseId?: string,
    @Query('secteur') secteur?: string,
    @Query('ville') ville?: string,
    @Query('categorie') categorie?: string,
    @Query('status') status?: AnnonceStatus,
    @Query('budget_min') budgetMin?: number,
    @Query('budget_max') budgetMax?: number,
    @Query('date_limite_apres') dateLimiteApres?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.consultations.search({
      q,
      entreprise_id: entrepriseId,
      secteur,
      ville,
      categorie,
      status,
      budget_min: budgetMin ? Number(budgetMin) : undefined,
      budget_max: budgetMax ? Number(budgetMax) : undefined,
      date_limite_apres: dateLimiteApres ? new Date(dateLimiteApres) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.consultations.findOne(id);
  }

  @Patch(':id/vue')
  markVue(@Param('id') id: string) {
    return this.consultations.markVue(id);
  }

  @Patch(':id/ignorer')
  ignorer(@Param('id') id: string) {
    return this.consultations.ignorer(id);
  }

  @Post(':id/importer')
  @Roles(Role.ADMIN, Role.GERANT)
  importer(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.consultations.importVersMarche(id, userId);
  }
}
