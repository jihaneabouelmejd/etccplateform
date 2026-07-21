import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, EntrepriseStatus, EntrepriseType } from '@prisma/client';
import { EntreprisesService } from './entreprises.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireModule } from '../../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('veille-entreprises')
@Controller('veille/entreprises')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.GERANT, Role.EMPLOYE)
@RequireModule('veille')
@ApiBearerAuth()
export class EntreprisesController {
  constructor(private readonly entreprises: EntreprisesService) {}

  @Get()
  findAll(
    @Query('status') status?: EntrepriseStatus,
    @Query('type_entreprise') typeEntreprise?: EntrepriseType,
    @Query('secteur') secteur?: string,
    @Query('ville') ville?: string,
    @Query('search') search?: string,
    @Query('favoris') favoris?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser('id') userId?: string,
  ) {
    return this.entreprises.findAll({
      status,
      type_entreprise: typeEntreprise,
      secteur,
      ville,
      search,
      favorisUserId: favoris === '1' ? userId : undefined,
      currentUserId: userId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('dashboard')
  dashboard() {
    return this.entreprises.dashboardStats();
  }

  @Get('a-configurer')
  aConfigurer() {
    return this.entreprises.sourcesAConfigurer();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.entreprises.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.GERANT)
  create(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.entreprises.create(body, userId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  update(@Param('id') id: string, @Body() body: any) {
    return this.entreprises.update(id, body);
  }

  @Patch(':id/config')
  @Roles(Role.ADMIN, Role.GERANT)
  configureSelectors(@Param('id') id: string, @Body() config: Record<string, any>) {
    return this.entreprises.configureSelectors(id, config);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  remove(@Param('id') id: string) {
    return this.entreprises.remove(id);
  }

  @Post(':id/sync')
  syncNow(@Param('id') id: string) {
    return this.entreprises.syncNow(id);
  }

  @Post(':id/favori')
  toggleFavori(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.entreprises.toggleFavori(id, userId);
  }
}
