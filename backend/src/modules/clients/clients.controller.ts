import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('clients')
@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GERANT)
  create(@Body() data: any) { return this.clients.create(data); }

  @Get()
  @Roles(Role.ADMIN, Role.GERANT)
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('active') active?: string,
  ) {
    const activeFilter = active === undefined ? true : active === 'true';
    return this.clients.findAll({ search, page, active: activeFilter });
  }

  @Get('top')
  @Roles(Role.ADMIN, Role.GERANT)
  getTop() { return this.clients.getTopClients(); }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  findOne(@Param('id') id: string) { return this.clients.findOne(id); }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  update(@Param('id') id: string, @Body() data: any) { return this.clients.update(id, data); }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  archive(@Param('id') id: string) { return this.clients.archive(id); }
}
