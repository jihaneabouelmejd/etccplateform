import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { FournisseursService } from './fournisseurs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('fournisseurs')
@Controller('fournisseurs')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FournisseursController {
  constructor(private readonly fournisseurs: FournisseursService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  create(@Body() data: any) { return this.fournisseurs.create(data); }

  @Get()
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  findAll(@Query('search') search?: string, @Query('category') category?: string, @Query('page') page?: number) {
    return this.fournisseurs.findAll({ search, category, page });
  }

  @Get('categories')
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  getCategories() { return this.fournisseurs.getCategories(); }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT, Role.COMPTABLE)
  findOne(@Param('id') id: string) { return this.fournisseurs.findOne(id); }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  update(@Param('id') id: string, @Body() data: any) { return this.fournisseurs.update(id, data); }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  remove(@Param('id') id: string) { return this.fournisseurs.remove(id); }
}
