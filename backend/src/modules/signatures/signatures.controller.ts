import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SignaturesService } from './signatures.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('signatures')
@Controller('signatures')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Post()
  create(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.signatures.create({ ...data, user_id: userId });
  }

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.signatures.findAllByUser(userId);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.signatures.setDefault(id, userId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.signatures.delete(id, userId);
  }
}
