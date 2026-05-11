import { Module } from '@nestjs/common';
import { RapprochementController } from './rapprochement.controller';
import { RapprochementService } from './rapprochement.service';
import { FournisseursModule } from '../fournisseurs/fournisseurs.module';

@Module({
  imports: [FournisseursModule],
  controllers: [RapprochementController],
  providers: [RapprochementService],
  exports: [RapprochementService],
})
export class RapprochementModule {}
