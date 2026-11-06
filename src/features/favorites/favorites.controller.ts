import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { BASE_VARIANT_ID } from '../products/mappers/product-response.mapper';
import { AddFavoriteDto } from './dto/add-favorite.dto';
import { FavoritesService } from './favorites.service';

/** Every route here requires a logged-in storefront user - there is no concept of an admin's own favorites. */
@Controller('favorites')
@Auth()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  list(@GetUser('id') userId: string) {
    return this.favoritesService.list(userId);
  }

  @Post(':productId')
  @HttpCode(HttpStatus.OK)
  add(
    @GetUser('id') userId: string,
    @Param('productId') productId: string,
    @Body() dto: AddFavoriteDto,
  ) {
    return this.favoritesService.add(userId, productId, dto.variantId ?? BASE_VARIANT_ID);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @GetUser('id') userId: string,
    @Param('productId') productId: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.favoritesService.remove(userId, productId, variantId ?? BASE_VARIANT_ID);
  }
}
