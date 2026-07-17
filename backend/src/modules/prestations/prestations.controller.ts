import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrestationsService } from './prestations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('prestations')
@Controller('prestations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PrestationsController {
  constructor(private readonly prestations: PrestationsService) {}

  @Post()
  create(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.prestations.create(data, userId);
  }

  @Get()
  findAll(
    @Query('statut') statut?: string,
    @Query('search') search?: string,
    @Query('user_id') userId?: string,
  ) {
    return this.prestations.findAll({ statut, search, user_id: userId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prestations.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.prestations.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prestations.remove(id);
  }
}
