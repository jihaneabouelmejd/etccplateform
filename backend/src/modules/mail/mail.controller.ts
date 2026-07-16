import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { MailService } from './mail.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  SetMailAccountDto,
  SendMailDto,
  SaveDraftDto,
  MailFolderKind,
} from './dto/mail.dto';

const FOLDER_KINDS: MailFolderKind[] = ['inbox', 'sent', 'drafts', 'trash'];

function assertFolderKind(kind: string): MailFolderKind {
  if (!FOLDER_KINDS.includes(kind as MailFolderKind)) {
    throw new BadRequestException(`Dossier invalide: ${kind}`);
  }
  return kind as MailFolderKind;
}

@ApiTags('mail')
@Controller('mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MailController {
  constructor(private readonly mail: MailService) {}

  // ══════════════════════════════════════════════════════════════════════
  // Compte mail — Admin/Gérant configurent, l'utilisateur consulte le statut
  // ══════════════════════════════════════════════════════════════════════

  @Get('account/me')
  @ApiOperation({ summary: "Statut de ma boîte mail professionnelle" })
  getMyAccount(@CurrentUser('id') userId: string) {
    return this.mail.getMyAccountStatus(userId);
  }

  @Get('account/:userId')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: "Voir la config mail d'un utilisateur (masquée)" })
  getAccount(@Param('userId') userId: string) {
    return this.mail.getAccountForAdmin(userId);
  }

  @Put('account/:userId')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: "Associer / mettre à jour l'adresse Hostinger d'un utilisateur" })
  setAccount(@Param('userId') userId: string, @Body() dto: SetMailAccountDto) {
    return this.mail.setAccountForUser(userId, dto);
  }

  @Delete('account/:userId')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: "Retirer la boîte mail associée à un utilisateur" })
  removeAccount(@Param('userId') userId: string) {
    return this.mail.removeAccountForUser(userId);
  }

  @Post('account/:userId/test')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Tester la connexion IMAP/SMTP' })
  testAccount(@Param('userId') userId: string) {
    return this.mail.testConnection(userId);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Boîtes mail multiples (principale + partagées)
  // ══════════════════════════════════════════════════════════════════════

  @Get('accounts/me')
  @ApiOperation({ summary: 'Liste de mes boîtes mail (principale + partagées)' })
  listMyAccounts(@CurrentUser('id') userId: string) {
    return this.mail.listAccountsForUser(userId);
  }

  @Get('accounts/:userId')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: "Liste des boîtes mail d'un utilisateur (admin)" })
  listAccounts(@Param('userId') userId: string) {
    return this.mail.listAccountsForAdmin(userId);
  }

  @Post('accounts/:userId')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Ajouter une boîte mail partagée à un utilisateur' })
  addSharedAccount(@Param('userId') userId: string, @Body() dto: SetMailAccountDto) {
    return this.mail.addSharedAccount(userId, dto);
  }

  @Delete('accounts/:userId/:accountId')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Retirer une boîte mail partagée' })
  removeSharedAccount(
    @Param('userId') userId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.mail.removeSharedAccount(userId, accountId);
  }

  @Post('accounts/:userId/:accountId/test')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Tester la connexion IMAP/SMTP pour une boîte spécifique' })
  testSharedAccount(
    @Param('userId') userId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.mail.testAccountById(userId, accountId);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Notifications
  // ══════════════════════════════════════════════════════════════════════

  @Get('unread-count')
  @ApiOperation({ summary: 'Nombre de messages non lus (boîte de réception)' })
  unreadCount(@CurrentUser('id') userId: string) {
    return this.mail.getUnreadCount(userId);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Dossiers / messages
  // ══════════════════════════════════════════════════════════════════════

  @Get('folder/:kind')
  @ApiOperation({ summary: 'Lister les messages d\'un dossier (inbox, sent, drafts, trash)' })
  listFolder(
    @CurrentUser('id') userId: string,
    @Param('kind') kind: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.mail.listMessages(userId, assertFolderKind(kind), {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      q,
      accountId,
    });
  }

  @Get('folder/:kind/:uid')
  @ApiOperation({ summary: "Détail d'un message" })
  getMessage(
    @CurrentUser('id') userId: string,
    @Param('kind') kind: string,
    @Param('uid') uid: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.mail.getMessage(userId, assertFolderKind(kind), parseInt(uid, 10), accountId);
  }

  @Delete('folder/:kind/:uid')
  @ApiOperation({ summary: "Supprimer un message (déplace vers Corbeille, ou définitif si déjà en Corbeille)" })
  deleteMessage(
    @CurrentUser('id') userId: string,
    @Param('kind') kind: string,
    @Param('uid') uid: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.mail.deleteMessage(userId, assertFolderKind(kind), parseInt(uid, 10), accountId);
  }

  @Get('folder/:kind/:uid/attachments/:index')
  @ApiOperation({ summary: "Télécharger une pièce jointe" })
  async downloadAttachment(
    @CurrentUser('id') userId: string,
    @Param('kind') kind: string,
    @Param('uid') uid: string,
    @Param('index') index: string,
    @Res() res: Response,
    @Query('accountId') accountId?: string,
  ) {
    const attachment = await this.mail.getAttachment(
      userId,
      assertFolderKind(kind),
      parseInt(uid, 10),
      parseInt(index, 10),
      accountId,
    );
    res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
    );
    res.send(attachment.content);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Composition (envoi / brouillon) — multipart avec pièces jointes
  // ══════════════════════════════════════════════════════════════════════

  @Post('send')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envoyer un email (nouveau / réponse / transfert)' })
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  sendMail(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMailDto,
    @UploadedFiles() files: any[],
  ) {
    return this.mail.sendMail(userId, {
      accountId: dto.account_id,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject || '(sans objet)',
      html: dto.html,
      text: dto.text,
      mode: dto.mode,
      sourceUid: dto.source_uid ? parseInt(dto.source_uid, 10) : undefined,
      sourceFolder: dto.source_folder,
      attachments: (files || []).map((f) => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        buffer: f.buffer,
        size: f.size,
      })),
    });
  }

  @Post('draft')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Enregistrer un brouillon' })
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  saveDraft(
    @CurrentUser('id') userId: string,
    @Body() dto: SaveDraftDto,
    @UploadedFiles() files: any[],
  ) {
    return this.mail.saveDraft(userId, {
      accountId: dto.account_id,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject || '(sans objet)',
      html: dto.html,
      text: dto.text,
      draftUid: dto.draft_uid ? parseInt(dto.draft_uid, 10) : undefined,
      attachments: (files || []).map((f) => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        buffer: f.buffer,
        size: f.size,
      })),
    });
  }
}
