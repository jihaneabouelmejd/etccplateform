import { Module } from '@nestjs/common';
import { BLController } from './bl.controller';
import { BLService } from './bl.service';

@Module({
  controllers: [BLController],
  providers: [BLService],
  exports: [BLService],
})
export class BLModule {}
