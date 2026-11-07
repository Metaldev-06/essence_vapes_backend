import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';

import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

/** Todo escrito/leído acá está siempre scoped al usuario del JWT - nunca se acepta un userId
 *  del cliente (mismo criterio que favorites/cart: cero IDOR posible). */
@Controller('addresses')
@Auth()
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  list(@GetUser('id') userId: string) {
    return this.addressesService.list(userId);
  }

  @Post()
  create(@GetUser('id') userId: string, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(userId, dto);
  }

  @Patch(':id')
  update(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.addressesService.remove(userId, id);
  }
}
