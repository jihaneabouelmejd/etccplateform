import { Module } from '@nestjs/common';
import { DettesController } from './dettes.controller';
import { DettesService } from './dettes.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({ imports:[PrismaModule], controllers:[DettesController], providers:[DettesService] })
export class DettesModule {}
