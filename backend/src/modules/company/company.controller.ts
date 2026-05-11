import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('company')
@Controller('company')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  @ApiOperation({ summary: 'Infos société' })
  get() {
    return this.company.get();
  }

  @Get('pdf-data')
  @ApiOperation({ summary: 'Données société pour PDFs' })
  getPdfData() {
    return this.company.getPdfData();
  }

  @Put()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Mettre à jour les infos société' })
  update(@Body() data: any) {
    return this.company.upsert(data);
  }
}
