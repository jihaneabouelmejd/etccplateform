import { Module } from '@nestjs/common';
import { BRController } from './br.controller';
import { BRService } from './br.service';

@Module({
  controllers: [BRController],
  providers: [BRService],
  exports: [BRService],
})
export class BRModule {}
