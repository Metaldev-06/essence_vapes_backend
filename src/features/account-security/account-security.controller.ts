import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { HashPassword } from '../../common/helpers/hashPassword.helper';
import { EmailService } from '../../common/services/email/email.service';
import { PasswordPolicyService } from '../../common/services/password-policy/password-policy.service';
import { AccountSecurityService } from './account-security.service';
import { ConfirmEmailVerificationDto } from './dto/confirm-email-verification.dto';
import { ConfirmPasswordChangeDto } from './dto/confirm-password-change.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyPasswordChangeCodeDto } from './dto/verify-password-change-code.dto';
import { VerifyPasswordResetCodeDto } from './dto/verify-password-reset-code.dto';
import { SecurityChallengePurpose } from './enums/security-challenge-purpose.enum';
import {
  buildEmailVerificationEmail,
  buildPasswordChangeCodeEmail,
  buildPasswordChangedNoticeEmail,
  buildPasswordResetCodeEmail,
} from './account-security-emails';

const GENERIC_FORGOT_MESSAGE =
  'Si existe una cuenta asociada a este correo, recibirás instrucciones para recuperar tu contraseña.';
const GENERIC_CODE_ERROR = 'El código ingresado no es válido o venció. Solicitá uno nuevo.';

@Controller('auth')
export class AccountSecurityController {
  constructor(
    private readonly accountSecurityService: AccountSecurityService,
    private readonly emailService: EmailService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------------------
  // Verificación de email
  // ---------------------------------------------------------------------------------------

  @Post('email-verification/resend')
  @Auth()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  async resendEmailVerification(@GetUser() user: User) {
    if (user.emailVerified) {
      return { message: 'Tu correo ya está verificado.' };
    }

    const limits = this.configService.get('accountSecurity.emailVerification')!;
    const gate = await this.accountSecurityService.canIssue(
      user.id,
      SecurityChallengePurpose.EMAIL_VERIFICATION,
      { cooldownMs: limits.resendCooldownMs, hourlyMax: limits.resendHourlyMax },
    );
    if (!gate.allowed) {
      throw new BadRequestException(
        `Esperá un poco antes de pedir otro correo (probá de nuevo en ${Math.ceil((gate.retryAfterMs ?? 0) / 1000)}s).`,
      );
    }

    const token = await this.accountSecurityService.issueEmailVerificationToken(
      user.id,
      limits.tokenTtlMs,
    );
    await this.sendVerificationEmail(user, token);
    return { message: 'Te enviamos un nuevo correo de verificación.' };
  }

  @Post('email-verification/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async confirmEmailVerification(@Body() dto: ConfirmEmailVerificationDto) {
    const result = await this.accountSecurityService.confirmEmailVerification(dto.token);
    return { outcome: result.outcome };
  }

  // ---------------------------------------------------------------------------------------
  // Olvidé mi contraseña (no autenticado)
  // ---------------------------------------------------------------------------------------

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const user = await this.accountSecurityService.findUserByEmail(dto.email);

    // Siempre la misma respuesta, tome el camino que tome - nunca revela si el email existe.
    if (user && user.isActive) {
      const limits = this.configService.get('accountSecurity.passwordReset')!;
      const gate = await this.accountSecurityService.canIssue(
        user.id,
        SecurityChallengePurpose.PASSWORD_RESET,
        { cooldownMs: limits.requestCooldownMs, hourlyMax: limits.requestHourlyMax },
      );
      if (gate.allowed) {
        const code = await this.accountSecurityService.issuePasswordResetCode(
          user.id,
          limits.codeTtlMs,
        );
        await this.emailService.send(
          buildPasswordResetCodeEmail(this.emailService.addresses.noReply, user, code),
        );
      }
      // Si no está permitido (cooldown/tope horario), no se manda nada - pero la respuesta al
      // cliente es idéntica, así no delata que ya había un código pendiente.
    }

    return { message: GENERIC_FORGOT_MESSAGE };
  }

  @Post('password/verify-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async verifyPasswordResetCode(@Body() dto: VerifyPasswordResetCodeDto) {
    const user = await this.accountSecurityService.findUserByEmail(dto.email);
    if (!user) throw new BadRequestException(GENERIC_CODE_ERROR);

    const result = await this.accountSecurityService.verifyCode(
      user.id,
      SecurityChallengePurpose.PASSWORD_RESET,
      dto.code,
    );
    if (result.outcome !== 'ok') throw new BadRequestException(this.codeErrorMessage(result.outcome));

    return { resetAuthorization: result.authorization };
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordPolicyService.assertAcceptable(dto.newPassword);

    const newPasswordHash = await HashPassword(dto.newPassword);
    const user = await this.accountSecurityService.applyNewPasswordByAuthorization(
      dto.resetAuthorization,
      newPasswordHash,
    );
    if (!user) {
      throw new BadRequestException(
        'Esta solicitud de recuperación venció o ya se usó. Empezá de nuevo desde "Olvidé mi contraseña".',
      );
    }

    await this.emailService.send(
      buildPasswordChangedNoticeEmail(this.emailService.addresses.noReply, user),
    );
    return { message: 'Tu contraseña se actualizó correctamente.' };
  }

  // ---------------------------------------------------------------------------------------
  // Cambiar contraseña (autenticado) - Fase 4, distinto de "olvidé mi contraseña"
  // ---------------------------------------------------------------------------------------

  @Post('password/change/request')
  @HttpCode(HttpStatus.OK)
  @Auth()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  async requestPasswordChange(@GetUser() user: User) {
    if (!user.emailVerified) {
      throw new BadRequestException(
        'Verificá tu correo antes de cambiar la contraseña. Podés reenviar el correo de verificación desde Configuración de cuenta.',
      );
    }

    const limits = this.configService.get('accountSecurity.passwordChange')!;
    const gate = await this.accountSecurityService.canIssue(
      user.id,
      SecurityChallengePurpose.PASSWORD_CHANGE,
      { cooldownMs: limits.requestCooldownMs, hourlyMax: limits.requestHourlyMax },
    );
    if (!gate.allowed) {
      throw new BadRequestException(
        `Esperá un poco antes de pedir otro código (probá de nuevo en ${Math.ceil((gate.retryAfterMs ?? 0) / 1000)}s).`,
      );
    }

    const code = await this.accountSecurityService.issuePasswordChangeCode(
      user.id,
      limits.codeTtlMs,
    );
    await this.emailService.send(
      buildPasswordChangeCodeEmail(this.emailService.addresses.noReply, user, code),
    );
    return { message: 'Te enviamos un código a tu correo.' };
  }

  @Post('password/change/verify')
  @HttpCode(HttpStatus.OK)
  @Auth()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async verifyPasswordChangeCode(
    @GetUser() user: User,
    @Body() dto: VerifyPasswordChangeCodeDto,
  ) {
    const result = await this.accountSecurityService.verifyCode(
      user.id,
      SecurityChallengePurpose.PASSWORD_CHANGE,
      dto.code,
    );
    if (result.outcome !== 'ok') throw new BadRequestException(this.codeErrorMessage(result.outcome));

    return { changeAuthorization: result.authorization };
  }

  @Post('password/change/confirm')
  @HttpCode(HttpStatus.OK)
  @Auth()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async confirmPasswordChange(@GetUser() user: User, @Body() dto: ConfirmPasswordChangeDto) {
    const currentPasswordValid = await this.accountSecurityService.verifyCurrentPassword(
      user.id,
      dto.currentPassword,
    );
    if (!currentPasswordValid) throw new BadRequestException('La contraseña actual no es correcta.');

    await this.passwordPolicyService.assertAcceptable(dto.newPassword);

    const newPasswordHash = await HashPassword(dto.newPassword);
    const updated = await this.accountSecurityService.applyNewPasswordForUser(
      user.id,
      dto.changeAuthorization,
      newPasswordHash,
    );
    if (!updated) {
      throw new BadRequestException(
        'Esta autorización venció o ya se usó. Volvé a pedir el código desde Seguridad.',
      );
    }

    await this.emailService.send(
      buildPasswordChangedNoticeEmail(this.emailService.addresses.noReply, updated),
    );
    return { message: 'Tu contraseña se actualizó correctamente.' };
  }

  // ---------------------------------------------------------------------------------------

  private codeErrorMessage(outcome: 'invalid' | 'expired' | 'too_many_attempts'): string {
    switch (outcome) {
      case 'expired':
        return 'El código venció. Solicitá uno nuevo.';
      case 'too_many_attempts':
        return 'Superaste el máximo de intentos. Solicitá un código nuevo.';
      default:
        return GENERIC_CODE_ERROR;
    }
  }

  async sendVerificationEmail(user: User, token: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('accountSecurity.frontendUrl')!;
    await this.emailService.send(
      buildEmailVerificationEmail(this.emailService.addresses.noReply, user, token, frontendUrl),
    );
  }
}
