import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaginationService } from '../../common/services/pagination/pagination.service';
import { AuthModule } from '../auth/auth.module';
import { WithdrawalRequest } from './entities/withdrawal-request.entity';
import { WithdrawalRequestsController } from './withdrawal-requests.controller';
import { WithdrawalRequestsService } from './withdrawal-requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([WithdrawalRequest]), AuthModule],
  controllers: [WithdrawalRequestsController],
  providers: [WithdrawalRequestsService, PaginationService],
})
export class WithdrawalRequestsModule {}
