import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role, BRStatus } from '@prisma/client';
import { BRService } from './br.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('br')
@Controller('br')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireModule('br')
@ApiBearerAuth()
export class BRController {
  constructor(private readonly br: BRService) {}

  @Post('import')
  @Roles(Role.ADMIN, Role.GERANT)
  importBR(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.br.importBR(data, userId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.GERANT, Role.EMPLOYE)
  findAll(
    @Query('status') status?: BRStatus,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('bc_id') bcId?: string,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('allowed_modules') allowedModules?: string[],
  ) {
    const hasFullAccess = role === Role.ADMIN || role === Role.GERANT
      || (role === Role.EMPLOYE && allowedModules?.includes('br'));
    const createdBy = hasFullAccess ? undefined : userId;
    return this.br.findAll({ status, search, page, limit, created_by: createdBy, bc_id: bcId });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  findOne(@Param('id') id: string) { return this.br.findOne(id); }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  update(@Param('id') id: string, @Body() data: { number?: string; reception_date?: string; project_id?: string | null; notes?: string | null }) {
    return this.br.update(id, data);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  cancel(@Param('id') id: string) { return this.br.cancel(id); }

  @Delete(':id/permanent')
  @Roles(Role.ADMIN, Role.GERANT)
  hardDelete(@Param('id') id: string) { return this.br.hardDelete(id); }
}
