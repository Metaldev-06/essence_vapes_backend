import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { BruteForceGuard } from '../security/brute-force.guard';
import { AuthService } from './auth.service';
import { Auth } from './decorators/auth.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';
import { toUserResponse } from './mappers/user-response.mapper';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  register(@Body() dto: RegisterUserDto) {
    return this.authService.register(dto);
  }

  /**
   * El rate-limit genérico (IP, `default`) corre igual vía el guard global; la protección de
   * fuerza bruta real (por cuenta Y por IP, con bloqueos progresivos) es `BruteForceGuard` -
   * ver `brute-force.service.ts`.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BruteForceGuard)
  login(@Body() dto: LoginUserDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
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

  @Patch('me')
  @Auth()
  updateProfile(@GetUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user, dto);
  }

  @Get('me/security')
  @Auth()
  getSecurityStatus(@GetUser() user: User) {
    return this.authService.getSecurityStatus(user);
  }

  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @Auth()
  async revokeAllSessions(@GetUser() user: User) {
    await this.authService.revokeAllSessions(user);
    return { message: 'Se cerraron todas tus sesiones.' };
  }
}
