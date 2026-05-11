import { Module } from '@nestjs/common';
import { BCController } from './bc.controller';
import { BCService } from './bc.service';

@Module({
  controllers: [BCController],
  providers: [BCService],
  exports: [BCService],
})
export class BCModule {}
