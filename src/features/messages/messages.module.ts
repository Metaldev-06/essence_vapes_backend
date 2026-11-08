import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { ResendInboxAdapter } from './adapters/resend-inbox.adapter';
import { CannedResponse } from './entities/canned-response.entity';
import { InboxSignature } from './entities/inbox-signature.entity';
import { MessageAuditLog } from './entities/message-audit-log.entity';
import { MessageNote } from './entities/message-note.entity';
import { MessageThreadState } from './entities/message-thread-state.entity';
import { WebhookEventLog } from './entities/webhook-event-log.entity';
import { MessagesController } from './messages.controller';
import { MessagesRealtimeService } from './messages-realtime.service';
import { MessagesService } from './messages.service';
import { MessagesWebhookController } from './messages-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessageThreadState,
      MessageNote,
      CannedResponse,
      InboxSignature,
      WebhookEventLog,
      MessageAuditLog,
      User,
    ]),
    AuthModule,
  ],
  controllers: [MessagesController, MessagesWebhookController],
  providers: [MessagesService, ResendInboxAdapter, MessagesRealtimeService],
})
export class MessagesModule {}
