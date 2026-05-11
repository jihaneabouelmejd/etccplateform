import { Module } from '@nestjs/common';
import { DepensesController } from './depenses.controller';
import { DepensesService } from './depenses.service';

@Module({
  controllers: [DepensesController],
  providers: [DepensesService],
  exports: [DepensesService],
})
export class DepensesModule {}
