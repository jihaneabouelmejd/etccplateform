import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, MarcheStage, MarcheDocType } from '@prisma/client';
import { MarchesPrivesService } from './marches-prives.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('marches-prives')
@Controller('marches-prives')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.GERANT, Role.EMPLOYE)
@RequireModule('marches-prives')
@ApiBearerAuth()
export class MarchesPrivesController {
  constructor(private readonly marches: MarchesPrivesService) {}

  @Post()
  create(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.marches.create(data, userId);
  }

  @Get()
  findAll(
    @Query('stage') stage?: MarcheStage,
    @Query('client_id') clientId?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.marches.findAll({
      stage,
      client_id: clientId,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  getStats() {
    return this.marches.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.marches.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.marches.update(id, data);
  }

  @Patch(':id/stage')
  changeStage(@Param('id') id: string, @Body() body: { stage: MarcheStage; [key: string]: any }, @CurrentUser('id') userId: string) {
    const { stage, ...extra } = body;
    return this.marches.changeStage(id, stage, extra, userId);
  }

  @Post(':id/transformer-en-chantier')
  @Roles(Role.ADMIN, Role.GERANT)
  transformerEnChantier(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.marches.transformerEnChantier(id, userId, {
      start_date: body?.start_date ? new Date(body.start_date) : undefined,
      end_date: body?.end_date ? new Date(body.end_date) : undefined,
      address: body?.address,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  remove(@Param('id') id: string) {
    return this.marches.remove(id);
  }

  // ─── Documents ──────────────────────────────────────────────────────────

  @Post(':id/documents')
  addDocument(
    @Param('id') id: string,
    @Body() body: { type?: MarcheDocType; nom: string; file_url: string; obligatoire?: boolean; expire_at?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.marches.addDocument(id, {
      ...body,
      expire_at: body.expire_at ? new Date(body.expire_at) : undefined,
    }, userId);
  }

  @Patch('documents/:docId')
  updateDocument(@Param('docId') docId: string, @Body() body: any) {
    return this.marches.updateDocument(docId, {
      ...body,
      expire_at: body.expire_at ? new Date(body.expire_at) : body.expire_at,
    });
  }

  @Delete('documents/:docId')
  removeDocument(@Param('docId') docId: string) {
    return this.marches.removeDocument(docId);
  }

  // ─── Dépenses ───────────────────────────────────────────────────────────

  @Post(':id/depenses')
  addDepense(
    @Param('id') id: string,
    @Body() body: { libelle: string; montant: number; date?: string; categorie?: string; notes?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.marches.addDepense(id, {
      ...body,
      date: body.date ? new Date(body.date) : undefined,
    }, userId);
  }

  @Patch('depenses/:depId')
  updateDepense(@Param('depId') depId: string, @Body() body: any) {
    return this.marches.updateDepense(depId, {
      ...body,
      date: body.date ? new Date(body.date) : body.date,
    });
  }

  @Delete('depenses/:depId')
  removeDepense(@Param('depId') depId: string) {
    return this.marches.removeDepense(depId);
  }
}
