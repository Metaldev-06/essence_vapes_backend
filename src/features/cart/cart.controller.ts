import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CartService } from './cart.service';
import { SetCartItemDto } from './dto/set-cart-item.dto';

/**
 * Every route requires a logged-in storefront user - this is the backend half of the cart.
 * Guests keep their cart entirely in sessionStorage on the frontend and never reach here;
 * `GET /products/stock` is what they use instead to re-check availability.
 */
@Controller('cart')
@Auth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@GetUser('id') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Put('items/:productId')
  setItem(
    @GetUser('id') userId: string,
    @Param('productId') productId: string,
    @Body() dto: SetCartItemDto,
  ) {
    return this.cartService.setItem(userId, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @GetUser('id') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeItem(userId, productId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@GetUser('id') userId: string) {
    return this.cartService.clear(userId);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(@GetUser('id') userId: string) {
    return this.cartService.validate(userId);
  }
}
