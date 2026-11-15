import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SharedFilter } from './entities/shared-filter.entity';
import { SharedFiltersController } from './shared-filters.controller';
import { SharedFiltersService } from './shared-filters.service';

/** Links cortos para compartir filtros del catálogo (`/productos?c=<código>`). */
@Module({
  imports: [TypeOrmModule.forFeature([SharedFilter])],
  controllers: [SharedFiltersController],
  providers: [SharedFiltersService],
})
export class SharedFiltersModule {}
