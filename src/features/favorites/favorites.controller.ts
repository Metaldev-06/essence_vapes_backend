import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
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
  add(@GetUser('id') userId: string, @Param('productId') productId: string) {
    return this.favoritesService.add(userId, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@GetUser('id') userId: string, @Param('productId') productId: string) {
    return this.favoritesService.remove(userId, productId);
  }
}
