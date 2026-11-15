import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CreateSharedFilterDto } from './dto/create-shared-filter.dto';
import { SharedFiltersService } from './shared-filters.service';

/**
 * Links cortos del botón "Compartir" del catálogo. Públicos (cualquier visitante comparte), con
 * límites anti-abuso: el alta valida cada valor y los mismos filtros siempre reutilizan el mismo
 * código, así que no se puede inflar la tabla repitiendo pedidos.
 */
@Controller('shared-filters')
export class SharedFiltersController {
  constructor(private readonly sharedFiltersService: SharedFiltersService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@Body() dto: CreateSharedFilterDto) {
    return this.sharedFiltersService.create(dto);
  }

  @Get(':code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  findOne(@Param('code') code: string) {
    return this.sharedFiltersService.findByCode(code);
  }
}
