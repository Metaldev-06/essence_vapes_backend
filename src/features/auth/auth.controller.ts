import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { SimpleRateLimitGuard } from '../../common/guards/simple-rate-limit.guard';
import { AuthService } from './auth.service';
import { Auth } from './decorators/auth.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { User } from './entities/user.entity';
import { toUserResponse } from './mappers/user-response.mapper';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(SimpleRateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
  register(@Body() dto: RegisterUserDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SimpleRateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
  login(@Body() dto: LoginUserDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @Auth()
  me(@GetUser() user: User) {
    return toUserResponse(user);
  }

  @Get('check-status')
  @Auth()
  checkStatus(@GetUser() user: User) {
    return this.authService.checkStatus(user);
  }
}
