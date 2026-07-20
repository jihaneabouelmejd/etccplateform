import { Module } from '@nestjs/common';
import { MarchesPrivesController } from './marches-prives.controller';
import { MarchesPrivesService } from './marches-prives.service';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [ProjectsModule, TasksModule],
  controllers: [MarchesPrivesController],
  providers: [MarchesPrivesService],
  exports: [MarchesPrivesService],
})
export class MarchesPrivesModule {}
