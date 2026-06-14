import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AgendaController],
  providers: [AgendaService, GoogleCalendarService],
  exports: [AgendaService, GoogleCalendarService],
})
export class AgendaModule {}
