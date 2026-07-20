import { Module } from '@nestjs/common';
import { MarchesPrivesController } from './marches-prives.controller';
import { MarchesPrivesService } from './marches-prives.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [MarchesPrivesController],
  providers: [MarchesPrivesService],
  exports: [MarchesPrivesService],
})
export class MarchesPrivesModule {}
