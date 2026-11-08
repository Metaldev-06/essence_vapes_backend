import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Delete,
  Query,
  Sse,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { map, Observable } from 'rxjs';

import { Role } from '../../common/enums/system-role.enum';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateCannedResponseDto, UpdateCannedResponseDto } from './dto/canned-response.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { CreateDraftDto, UpdateDraftDto } from './dto/draft.dto';
import { ListThreadsQueryDto } from './dto/list-threads-query.dto';
import { ReplyThreadDto } from './dto/reply-thread.dto';
import { SetThreadLabelsDto } from './dto/set-thread-labels.dto';
import { UpdateSignatureDto } from './dto/update-signature.dto';
import { UpdateThreadFolderDto } from './dto/update-thread-folder.dto';
import { UpdateThreadStateDto } from './dto/update-thread-state.dto';
import { InboxAddress } from './enums/inbox-address.enum';
import { MessagesRealtimeService } from './messages-realtime.service';
import { MessagesService } from './messages.service';
import type { User } from '../auth/entities/user.entity';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type StatsPeriod = 'today' | '7d' | '30d' | 'all';

function periodStart(period: StatsPeriod | undefined): Date | null {
  const now = new Date();
  switch (period) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case '7d':
      return new Date(now.getTime() - 7 * 86_400_000);
    case '30d':
      return new Date(now.getTime() - 30 * 86_400_000);
    default:
      return null;
  }
}

/** Centro de mensajes - todo admin-only (ver `@Auth(Role.ADMIN)`), un throttle genérico más
 *  ajustado que el default (es tráfico interno del panel, no público). */
@Controller('messages')
@Auth(Role.ADMIN)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly realtime: MessagesRealtimeService,
  ) {}

  @Get('inboxes')
  listInboxes() {
    return this.messagesService.listInboxesSummary();
  }

  @Get('threads')
  listThreads(@Query() query: ListThreadsQueryDto) {
    return this.messagesService.listThreads(query);
  }

  @Get('threads/:inbox/:threadId')
  getThread(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('threadId') threadId: string,
  ) {
    return this.messagesService.getThreadDetail(inbox, threadId);
  }

  @Post('threads/:inbox/:threadId/emails/:emailId/reply')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_ATTACHMENTS, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  reply(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('threadId') threadId: string,
    @Param('emailId') emailId: string,
    @Body() dto: ReplyThreadDto,
    @UploadedFiles() files: Array<Express.Multer.File> = [],
    @GetUser() user: User,
  ) {
    if (!dto.html && !dto.text) throw new BadRequestException('La respuesta necesita contenido');
    return this.messagesService.reply(inbox, threadId, emailId, dto, files, {
      id: user.id,
      email: user.email,
    });
  }

  @Patch('threads/:inbox/:threadId/state')
  updateState(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('threadId') threadId: string,
    @Body() dto: UpdateThreadStateDto,
    @GetUser() user: User,
  ) {
    return this.messagesService.updateState(inbox, threadId, dto, { id: user.id, email: user.email });
  }

  @Patch('threads/:inbox/:threadId/read')
  setRead(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('threadId') threadId: string,
    @Body('read') read: boolean,
    @GetUser() user: User,
  ) {
    return this.messagesService.setRead(inbox, threadId, Boolean(read), {
      id: user.id,
      email: user.email,
    });
  }

  @Patch('threads/:inbox/:threadId/folder')
  moveToFolder(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('threadId') threadId: string,
    @Body() dto: UpdateThreadFolderDto,
    @GetUser() user: User,
  ) {
    return this.messagesService.moveToFolder(inbox, threadId, dto.folder, {
      id: user.id,
      email: user.email,
    });
  }

  @Get('labels/:inbox')
  listLabels(@Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress) {
    return this.messagesService.listLabels(inbox);
  }

  @Post('labels/:inbox')
  createLabel(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Body() dto: CreateLabelDto,
    @GetUser() user: User,
  ) {
    return this.messagesService.createLabel(inbox, dto.name, dto.color, {
      id: user.id,
      email: user.email,
    });
  }

  @Put('threads/:inbox/:threadId/labels')
  setThreadLabels(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('threadId') threadId: string,
    @Body() dto: SetThreadLabelsDto,
    @GetUser() user: User,
  ) {
    return this.messagesService.setThreadLabels(inbox, threadId, dto.labelIds, {
      id: user.id,
      email: user.email,
    });
  }

  @Get('threads/:inbox/:threadId/notes')
  listNotes(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('threadId') threadId: string,
  ) {
    return this.messagesService.getThreadDetail(inbox, threadId).then((t) => t.notes);
  }

  @Post('threads/:inbox/:threadId/notes')
  addNote(
    @Param('threadId') threadId: string,
    @Body() dto: CreateNoteDto,
    @GetUser() user: User,
  ) {
    return this.messagesService.addNote(threadId, dto.body, {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
  }

  @Get('canned-responses')
  listCannedResponses(@Query('inbox', new ParseEnumPipe(InboxAddress, { optional: true })) inbox?: InboxAddress) {
    return this.messagesService.listCannedResponses(inbox);
  }

  @Post('canned-responses')
  createCannedResponse(@Body() dto: CreateCannedResponseDto, @GetUser() user: User) {
    return this.messagesService.createCannedResponse(dto, { id: user.id, email: user.email });
  }

  @Patch('canned-responses/:id')
  updateCannedResponse(
    @Param('id') id: string,
    @Body() dto: UpdateCannedResponseDto,
    @GetUser() user: User,
  ) {
    return this.messagesService.updateCannedResponse(id, dto, { id: user.id, email: user.email });
  }

  @Delete('canned-responses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCannedResponse(@Param('id') id: string, @GetUser() user: User) {
    return this.messagesService.removeCannedResponse(id, { id: user.id, email: user.email });
  }

  @Get('canned-responses/:id/preview')
  previewCannedResponse(
    @Param('id') id: string,
    @Query('nombreCliente') nombreCliente?: string,
    @Query('producto') producto?: string,
    @Query('comercio') comercio?: string,
  ) {
    return this.messagesService.previewCannedResponse(id, { nombreCliente, producto, comercio });
  }

  @Get('signatures')
  getSignatures() {
    return this.messagesService.getSignatures();
  }

  @Patch('signatures/:inbox')
  updateSignature(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Body() dto: UpdateSignatureDto,
    @GetUser() user: User,
  ) {
    return this.messagesService.updateSignature(inbox, dto, { id: user.id, email: user.email });
  }

  @Get('drafts/:inbox')
  listDrafts(@Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress) {
    return this.messagesService.listDrafts(inbox);
  }

  @Get('drafts/:inbox/:draftId')
  getDraft(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('draftId') draftId: string,
  ) {
    return this.messagesService.getDraft(inbox, draftId);
  }

  @Post('drafts/:inbox')
  createDraft(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Body() dto: CreateDraftDto,
    @GetUser() user: User,
  ) {
    return this.messagesService.createDraft(inbox, dto, { id: user.id, email: user.email });
  }

  @Patch('drafts/:inbox/:draftId')
  updateDraft(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('draftId') draftId: string,
    @Body() dto: UpdateDraftDto,
  ) {
    return this.messagesService.updateDraft(inbox, draftId, dto);
  }

  @Delete('drafts/:inbox/:draftId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDraft(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('draftId') draftId: string,
    @GetUser() user: User,
  ) {
    return this.messagesService.removeDraft(inbox, draftId, { id: user.id, email: user.email });
  }

  @Post('drafts/:inbox/:draftId/send')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  sendDraft(
    @Param('inbox', new ParseEnumPipe(InboxAddress)) inbox: InboxAddress,
    @Param('draftId') draftId: string,
    @Body('idempotencyKey') idempotencyKey: string,
    @GetUser() user: User,
  ) {
    if (!idempotencyKey) throw new BadRequestException('Falta idempotencyKey');
    return this.messagesService.sendDraft(inbox, draftId, idempotencyKey, {
      id: user.id,
      email: user.email,
    });
  }

  @Get('contacts/:email')
  getContact(@Param('email') email: string) {
    return this.messagesService.getContact(email);
  }

  @Get('stats')
  getStats(@Query('period') period?: StatsPeriod) {
    return this.messagesService.getStats(periodStart(period));
  }

  @Get('threads/:inbox/:threadId/emails/:emailId/attachments/:attachmentId')
  getAttachment() {
    // La API de Resend Inboxes (SDK ^6.37.0, confirmado contra sus tipos instalados) todavía no
    // expone un endpoint de descarga de contenido para adjuntos de un INBOX message (solo
    // id/filename/size vienen en el email) - el endpoint de adjuntos del SDK (`emails.attachments`)
    // es para emails salientes propios, no para correos entrantes de Inboxes. Documentado en
    // EMAIL_CRM.md como limitación conocida, a revisar cuando Resend lo agregue.
    throw new BadRequestException(
      'La descarga de adjuntos de correos entrantes todavía no está disponible en la API de ' +
        'Resend Inboxes - ver EMAIL_CRM.md. El nombre y tamaño del archivo sí se muestran.',
    );
  }

  /** Server-Sent Events - un nuevo correo o cambio de estado empuja un evento a todo admin
   *  conectado. Reconexión: el navegador reintenta solo (comportamiento nativo de `EventSource`). */
  @Sse('events')
  events(): Observable<{ data: string }> {
    return this.realtime.events$.pipe(map((event) => ({ data: JSON.stringify(event) })));
  }
}
