import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';

import { Role } from '../../common/enums/system-role.enum';
import { Auth } from '../auth/decorators/auth.decorator';
import { SecurityStateService } from './security-state.service';

/**
 * Forma real (no solo documentada) de desbloquear a un cliente legítimo: ver/borrar los
 * bloqueos de IP y los lockouts de cuenta vigentes. Admin only.
 */
@Controller('security')
@Auth(Role.ADMIN)
export class SecurityAdminController {
  constructor(private readonly securityState: SecurityStateService) {}

  @Get('ip-blocks')
  listIpBlocks() {
    return this.securityState.listIpBlocks();
  }

  @Delete('ip-blocks/:ip')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblockIp(@Param('ip') ip: string): Promise<void> {
    await this.securityState.unblockIp(ip);
  }

  @Get('account-lockouts')
  listAccountLockouts() {
    return this.securityState.listAccountLockouts();
  }

  @Delete('account-lockouts/:email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlockAccount(@Param('email') email: string): Promise<void> {
    await this.securityState.deleteAccountLockout(email.toLowerCase().trim());
  }
}
