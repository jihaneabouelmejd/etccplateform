import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailComposer = require('nodemailer/lib/mail-composer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { simpleParser } = require('mailparser');
import { PrismaService } from '../../prisma/prisma.service';
import { encryptMailSecret, decryptMailSecret } from '../../common/utils/mail-crypto.util';
import { MailFolderKind, SetMailAccountDto } from './dto/mail.dto';

export interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════
  // Gestion du compte mail (Admin) — jamais saisi par l'utilisateur final
  // ══════════════════════════════════════════════════════════════════════

  async setAccountForUser(targetUserId: string, dto: SetMailAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const data = {
      email_address: dto.email_address.toLowerCase().trim(),
      password_enc: encryptMailSecret(dto.password),
      imap_host: (dto.imap_host || 'imap.hostinger.com').trim(),
      imap_port: dto.imap_port || 993,
      smtp_host: (dto.smtp_host || 'smtp.hostinger.com').trim(),
      smtp_port: dto.smtp_port || 465,
      is_active: true,
      last_error: null as string | null,
    };

    const existingPrimary = await this.prisma.mailAccount.findFirst({
      where: { user_id: targetUserId, is_primary: true },
    });

    const account = existingPrimary
      ? await this.prisma.mailAccount.update({ where: { id: existingPrimary.id }, data })
      : await this.prisma.mailAccount.create({
          data: { user_id: targetUserId, is_primary: true, ...data },
        });

    return this.maskAccount(account);
  }

  async removeAccountForUser(targetUserId: string) {
    await this.prisma.mailAccount.deleteMany({ where: { user_id: targetUserId, is_primary: true } });
    return { success: true };
  }

  async getAccountForAdmin(targetUserId: string) {
    const account = await this.prisma.mailAccount.findFirst({
      where: { user_id: targetUserId, is_primary: true },
    });
    if (!account) return null;
    return this.maskAccount(account);
  }

  async getMyAccountStatus(userId: string) {
    const account = await this.prisma.mailAccount.findFirst({
      where: { user_id: userId, is_primary: true },
    });
    if (!account) {
      return { configured: false };
    }
    return { configured: true, ...this.maskAccount(account) };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Boîtes partagées — un même utilisateur peut avoir, en plus de sa boîte
  // personnelle, l'accès à une ou plusieurs boîtes partagées (ex: contact@etcc.ma)
  // ══════════════════════════════════════════════════════════════════════

  async listAccountsForUser(userId: string) {
    const accounts = await this.prisma.mailAccount.findMany({
      where: { user_id: userId, is_active: true },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
    });
    return accounts.map((a) => ({ id: a.id, email_address: a.email_address, is_primary: a.is_primary }));
  }

  async listAccountsForAdmin(targetUserId: string) {
    const accounts = await this.prisma.mailAccount.findMany({
      where: { user_id: targetUserId },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
    });
    return accounts.map((a) => ({ id: a.id, ...this.maskAccount(a) }));
  }

  async addSharedAccount(targetUserId: string, dto: SetMailAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const email = dto.email_address.toLowerCase().trim();
    const existing = await this.prisma.mailAccount.findFirst({
      where: { user_id: targetUserId, email_address: email },
    });
    if (existing) {
      throw new BadRequestException('Cette adresse est déjà associée à cet utilisateur.');
    }

    const account = await this.prisma.mailAccount.create({
      data: {
        user_id: targetUserId,
        is_primary: false,
        email_address: email,
        password_enc: encryptMailSecret(dto.password),
        imap_host: (dto.imap_host || 'imap.hostinger.com').trim(),
        imap_port: dto.imap_port || 993,
        smtp_host: (dto.smtp_host || 'smtp.hostinger.com').trim(),
        smtp_port: dto.smtp_port || 465,
        is_active: true,
      },
    });
    return { id: account.id, ...this.maskAccount(account) };
  }

  async removeSharedAccount(targetUserId: string, accountId: string) {
    await this.prisma.mailAccount.deleteMany({
      where: { id: accountId, user_id: targetUserId, is_primary: false },
    });
    return { success: true };
  }

  async testAccountById(targetUserId: string, accountId: string) {
    return this.testConnection(targetUserId, accountId);
  }

  private maskAccount(account: any) {
    return {
      email_address: account.email_address,
      imap_host: account.imap_host,
      imap_port: account.imap_port,
      smtp_host: account.smtp_host,
      smtp_port: account.smtp_port,
      is_active: account.is_active,
      last_error: account.last_error,
      last_checked_at: account.last_checked_at,
    };
  }

  async testConnection(targetUserId: string, accountId?: string) {
    try {
      await this.withClient(targetUserId, async (client) => {
        await client.list();
      }, accountId);
      const account = await this.getAccountOrThrow(targetUserId, accountId);
      await this.prisma.mailAccount.update({
        where: { id: account.id },
        data: { last_error: null, last_checked_at: new Date() },
      });
      return { success: true };
    } catch (err: any) {
      const account = await this.getAccountOrThrow(targetUserId, accountId).catch(() => null);
      if (account) {
        await this.prisma.mailAccount.update({
          where: { id: account.id },
          data: { last_error: err.message?.slice(0, 500), last_checked_at: new Date() },
        }).catch(() => {});
      }
      return { success: false, message: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Connexion IMAP (une connexion éphémère par requête — pas de sync locale)
  // ══════════════════════════════════════════════════════════════════════

  private async getAccountOrThrow(userId: string, accountId?: string) {
    const account = accountId
      ? await this.prisma.mailAccount.findFirst({ where: { id: accountId, user_id: userId } })
      : await this.prisma.mailAccount.findFirst({
          where: { user_id: userId, is_primary: true },
        });
    if (!account || !account.is_active) {
      throw new NotFoundException(
        "Aucune boîte mail professionnelle n'est configurée pour votre compte. Contactez votre administrateur.",
      );
    }
    return account;
  }

  private async withClient<T>(
    userId: string,
    fn: (client: ImapFlow, account: any) => Promise<T>,
    accountId?: string,
  ): Promise<T> {
    const account = await this.getAccountOrThrow(userId, accountId);
    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: true,
      auth: { user: account.email_address, pass: decryptMailSecret(account.password_enc) },
      logger: false,
    });
    try {
      await client.connect();
      return await fn(client, account);
    } catch (err: any) {
      this.logger.error(`[IMAP:${account.email_address}] ${err.message}`);
      throw new BadGatewayException(
        `Connexion à la messagerie impossible : ${err.message}`,
      );
    } finally {
      try {
        await client.logout();
      } catch {
        try {
          client.close();
        } catch {
          /* noop */
        }
      }
    }
  }

  private buildSmtpTransport(account: any) {
    return nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_port === 465,
      auth: { user: account.email_address, pass: decryptMailSecret(account.password_enc) },
      // Sans ces timeouts, une connexion SMTP bloquée peut faire attendre la requête
      // indéfiniment jusqu'à ce que le proxy Railway la coupe (ECONNRESET / "socket hang up"),
      // ce qui masque l'erreur réelle derrière un 500 générique côté client.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  // ── Envoi via le relais SMTP Hostinger (contourne le blocage SMTP de Railway) ──
  // Si MAIL_RELAY_URL est configuré, on délègue la connexion SMTP réelle à un
  // petit script PHP hébergé sur Hostinger (voir docs/send-relay.php), qui n'est
  // pas soumis au blocage des ports 25/465/587 de Railway. Sinon, on retombe sur
  // l'envoi SMTP direct (utile en développement local).
  private async sendViaRelay(account: any, rawMessage: Buffer, envelopeTo: string[]): Promise<void> {
    const relayUrl = process.env.MAIL_RELAY_URL as string;
    const relaySecret = process.env.MAIL_RELAY_SECRET || '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Secret': relaySecret,
        },
        body: JSON.stringify({
          host: account.smtp_host,
          port: account.smtp_port,
          secure: account.smtp_port === 465,
          user: account.email_address,
          pass: decryptMailSecret(account.password_enc),
          envelopeFrom: account.email_address,
          envelopeTo,
          rawMessageBase64: rawMessage.toString('base64'),
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new Error(
        err.name === 'AbortError' ? 'Le relais SMTP ne répond pas (timeout).' : `Relais SMTP injoignable : ${err.message}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Le relais SMTP a répondu avec une erreur (HTTP ${res.status}).`);
    }
  }

  // ── Détection auto des dossiers (Hostinger utilise des noms variables) ──
  private async resolveFolderPath(client: ImapFlow, kind: MailFolderKind): Promise<string> {
    if (kind === 'inbox') return 'INBOX';

    const list = await client.list();
    const specialUseMap: Record<string, string> = {
      sent: '\\Sent',
      drafts: '\\Drafts',
      trash: '\\Trash',
    };
    const nameFallback: Record<string, RegExp> = {
      sent: /^(sent|sent items|sent messages|envoyes|éléments envoyés|inbox[./]sent)$/i,
      drafts: /^(drafts|brouillons|inbox[./]drafts)$/i,
      trash: /^(trash|deleted items|deleted messages|corbeille|junk|inbox[./]trash)$/i,
    };

    const bySpecialUse = list.find((m) => m.specialUse === specialUseMap[kind]);
    if (bySpecialUse) return bySpecialUse.path;

    const byName = list.find((m) => nameFallback[kind].test(m.name));
    if (byName) return byName.path;

    // Dernier recours : nom standard capitalisé
    const defaults: Record<string, string> = { sent: 'Sent', drafts: 'Drafts', trash: 'Trash' };
    return defaults[kind];
  }

  // ══════════════════════════════════════════════════════════════════════
  // Liste des messages d'un dossier (pagination + recherche)
  // ══════════════════════════════════════════════════════════════════════

  async listMessages(
    userId: string,
    kind: MailFolderKind,
    opts: { page?: number; limit?: number; q?: string; accountId?: string },
  ) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 25;

    return this.withClient(userId, async (client) => {
      const path = await this.resolveFolderPath(client, kind);
      const lock = await client.getMailboxLock(path);
      try {
        const mailbox: any = (client as any).mailbox;
        const total = mailbox?.exists || 0;
        let uidsDesc: number[] = [];

        if (opts.q && opts.q.trim()) {
          const query = opts.q.trim();
          const found = await client.search(
            {
              or: [
                { subject: query },
                { from: query },
                { to: query },
                { body: query },
              ],
            } as any,
            { uid: true },
          );
          uidsDesc = (Array.isArray(found) ? found : []).sort((a, b) => b - a);

          const totalMatches = uidsDesc.length;
          const pageUids = uidsDesc.slice((page - 1) * limit, (page - 1) * limit + limit);
          if (pageUids.length === 0) {
            return { total: totalMatches, page, limit, messages: [] };
          }
          const messages: any[] = [];
          for await (const msg of client.fetch(
            pageUids,
            { uid: true, envelope: true, flags: true, size: true, bodyStructure: true, internalDate: true },
            { uid: true },
          )) {
            messages.push(this.summarizeMessage(msg));
          }
          messages.sort((a, b) => b.uid - a.uid);
          return { total: totalMatches, page, limit, messages };
        }

        // Pas de recherche : pagination directe par plage de séquence (le plus récent = séquence la plus haute)
        if (total === 0) return { total: 0, page, limit, messages: [] };
        const end = total - (page - 1) * limit;
        if (end < 1) return { total, page, limit, messages: [] };
        const start = Math.max(1, end - limit + 1);

        const messages: any[] = [];
        for await (const msg of client.fetch(
          `${start}:${end}`,
          { uid: true, envelope: true, flags: true, size: true, bodyStructure: true, internalDate: true },
          { uid: false },
        )) {
          messages.push(this.summarizeMessage(msg));
        }
        messages.sort((a, b) => b.uid - a.uid);

        return { total, page, limit, messages };
      } finally {
        lock.release();
      }
    }, opts.accountId);
  }

  private hasAttachments(bodyStructure: any): boolean {
    if (!bodyStructure) return false;
    const walk = (node: any): boolean => {
      if (!node) return false;
      if (node.disposition && String(node.disposition).toLowerCase() === 'attachment') return true;
      if (node.parameters?.name || node.dispositionParameters?.filename) {
        if (node.type !== 'text') return true;
      }
      if (Array.isArray(node.childNodes)) {
        return node.childNodes.some(walk);
      }
      return false;
    };
    return walk(bodyStructure);
  }

  private summarizeMessage(msg: any) {
    const env = msg.envelope || {};
    const fmtAddr = (a: any) =>
      a ? `${a.name ? a.name + ' ' : ''}<${a.address}>`.trim() : '';
    return {
      uid: msg.uid,
      subject: env.subject || '(sans objet)',
      from: (env.from || []).map(fmtAddr).join(', '),
      to: (env.to || []).map(fmtAddr).join(', '),
      date: env.date || msg.internalDate,
      seen: msg.flags ? msg.flags.has('\\Seen') : true,
      flagged: msg.flags ? msg.flags.has('\\Flagged') : false,
      size: msg.size || 0,
      hasAttachments: this.hasAttachments(msg.bodyStructure),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Détail d'un message + pièces jointes
  // ══════════════════════════════════════════════════════════════════════

  async getMessage(userId: string, kind: MailFolderKind, uid: number, accountId?: string) {
    return this.withClient(userId, async (client) => {
      const path = await this.resolveFolderPath(client, kind);
      const lock = await client.getMailboxLock(path);
      try {
        const raw = await client.download(uid, undefined, { uid: true });
        if (!raw) throw new NotFoundException('Message introuvable');
        const chunks: Buffer[] = [];
        for await (const chunk of raw.content) chunks.push(chunk as Buffer);
        const buffer = Buffer.concat(chunks);
        const parsed = await simpleParser(buffer);

        // Marquer comme lu (sauf brouillons/corbeille)
        if (kind === 'inbox' || kind === 'sent') {
          try {
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
          } catch {
            /* noop */
          }
        }

        return {
          uid,
          subject: parsed.subject || '(sans objet)',
          from: parsed.from?.text || '',
          to: parsed.to
            ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).map((t: any) => t.text).join(', ')
            : '',
          cc: parsed.cc
            ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).map((c: any) => c.text).join(', ')
            : '',
          date: parsed.date,
          messageId: parsed.messageId,
          html: parsed.html || null,
          text: parsed.text || null,
          attachments: (parsed.attachments || []).map((a: any, idx: number) => ({
            index: idx,
            filename: a.filename || `piece-jointe-${idx + 1}`,
            contentType: a.contentType,
            size: a.size,
          })),
        };
      } finally {
        lock.release();
      }
    }, accountId);
  }

  async getAttachment(userId: string, kind: MailFolderKind, uid: number, index: number, accountId?: string) {
    return this.withClient(userId, async (client) => {
      const path = await this.resolveFolderPath(client, kind);
      const lock = await client.getMailboxLock(path);
      try {
        const raw = await client.download(uid, undefined, { uid: true });
        if (!raw) throw new NotFoundException('Message introuvable');
        const chunks: Buffer[] = [];
        for await (const chunk of raw.content) chunks.push(chunk as Buffer);
        const buffer = Buffer.concat(chunks);
        const parsed = await simpleParser(buffer);
        const attachment = (parsed.attachments || [])[index];
        if (!attachment) throw new NotFoundException('Pièce jointe introuvable');
        return {
          filename: attachment.filename || `piece-jointe-${index + 1}`,
          contentType: attachment.contentType,
          content: attachment.content as Buffer,
        };
      } finally {
        lock.release();
      }
    }, accountId);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Envoi (SMTP) + copie dans Envoyés (IMAP APPEND)
  // ══════════════════════════════════════════════════════════════════════

  private async buildRawMessage(
    account: any,
    fromDisplayName: string,
    fields: {
      to?: string;
      cc?: string;
      bcc?: string;
      subject: string;
      html?: string;
      text?: string;
      attachments?: UploadedAttachment[];
      inReplyTo?: string;
      references?: string;
    },
  ): Promise<Buffer> {
    const mailOptions: any = {
      from: `"${fromDisplayName}" <${account.email_address}>`,
      to: fields.to || undefined,
      cc: fields.cc || undefined,
      bcc: fields.bcc || undefined,
      subject: fields.subject,
      html: fields.html || undefined,
      text: fields.text || (fields.html ? undefined : ''),
      inReplyTo: fields.inReplyTo || undefined,
      references: fields.references || undefined,
      attachments: (fields.attachments || []).map((a) => ({
        filename: a.originalname,
        content: a.buffer,
        contentType: a.mimetype,
      })),
    };

    const composer = new MailComposer(mailOptions);
    return new Promise<Buffer>((resolve, reject) => {
      composer.compile().build((err: any, message: Buffer) => {
        if (err) reject(err);
        else resolve(message);
      });
    });
  }

  async sendMail(
    userId: string,
    fields: {
      to?: string;
      cc?: string;
      bcc?: string;
      subject: string;
      html?: string;
      text?: string;
      attachments?: UploadedAttachment[];
      sourceUid?: number;
      sourceFolder?: MailFolderKind;
      mode?: 'new' | 'reply' | 'reply_all' | 'forward';
      accountId?: string;
    },
  ) {
    if (!fields.to || !fields.to.trim()) {
      throw new BadRequestException('Destinataire requis');
    }

    const account = await this.getAccountOrThrow(userId, fields.accountId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const fromDisplayName = user ? `${user.first_name} ${user.last_name}` : account.email_address;

    let inReplyTo: string | undefined;
    let references: string | undefined;
    let attachments = fields.attachments || [];

    // Répondre / transférer : récupérer les en-têtes de threading (+ pièces jointes si transfert)
    if (fields.sourceUid && fields.sourceFolder && (fields.mode === 'reply' || fields.mode === 'reply_all' || fields.mode === 'forward')) {
      try {
        await this.withClient(userId, async (client) => {
          const path = await this.resolveFolderPath(client, fields.sourceFolder as MailFolderKind);
          const lock = await client.getMailboxLock(path);
          try {
            const raw = await client.download(fields.sourceUid as number, undefined, { uid: true });
            if (raw) {
              const chunks: Buffer[] = [];
              for await (const chunk of raw.content) chunks.push(chunk as Buffer);
              const parsed = await simpleParser(Buffer.concat(chunks));
              if (fields.mode !== 'forward') {
                inReplyTo = parsed.messageId;
                references = [parsed.references, parsed.messageId].filter(Boolean).join(' ');
              } else {
                attachments = [
                  ...attachments,
                  ...(parsed.attachments || []).map((a: any) => ({
                    originalname: a.filename || 'piece-jointe',
                    mimetype: a.contentType,
                    buffer: a.content,
                    size: a.size,
                  })),
                ];
              }
            }
          } finally {
            lock.release();
          }
        }, fields.accountId);
      } catch {
        // Ne bloque pas l'envoi si le message d'origine n'a pas pu être relu
      }
    }

    const rawMessage = await this.buildRawMessage(account, fromDisplayName, {
      to: fields.to,
      cc: fields.cc,
      bcc: fields.bcc,
      subject: fields.subject,
      html: fields.html,
      text: fields.text,
      attachments,
      inReplyTo,
      references,
    });

    const envelopeTo = [fields.to, fields.cc, fields.bcc]
      .filter(Boolean)
      .join(',')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (process.env.MAIL_RELAY_URL) {
        await this.sendViaRelay(account, rawMessage, envelopeTo);
      } else {
        const transporter = this.buildSmtpTransport(account);
        await transporter.sendMail({
          envelope: { from: account.email_address, to: envelopeTo },
          raw: rawMessage,
        });
      }
    } catch (err: any) {
      throw new BadGatewayException(`Échec de l'envoi : ${err.message}`);
    }

    // Copier dans "Envoyés" pour cohérence avec Hostinger webmail
    try {
      await this.withClient(userId, async (client) => {
        const sentPath = await this.resolveFolderPath(client, 'sent');
        await client.append(sentPath, rawMessage, ['\\Seen']);
      }, fields.accountId);
    } catch (err: any) {
      this.logger.warn(`Copie dans Envoyés échouée pour ${account.email_address}: ${err.message}`);
    }

    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Brouillons
  // ══════════════════════════════════════════════════════════════════════

  async saveDraft(
    userId: string,
    fields: {
      to?: string;
      cc?: string;
      bcc?: string;
      subject: string;
      html?: string;
      text?: string;
      attachments?: UploadedAttachment[];
      draftUid?: number;
      accountId?: string;
    },
  ) {
    const account = await this.getAccountOrThrow(userId, fields.accountId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const fromDisplayName = user ? `${user.first_name} ${user.last_name}` : account.email_address;

    const rawMessage = await this.buildRawMessage(account, fromDisplayName, {
      to: fields.to,
      cc: fields.cc,
      bcc: fields.bcc,
      subject: fields.subject || '(sans objet)',
      html: fields.html,
      text: fields.text,
      attachments: fields.attachments,
    });

    return this.withClient(userId, async (client) => {
      const draftsPath = await this.resolveFolderPath(client, 'drafts');

      // Remplace l'ancien brouillon si édition
      if (fields.draftUid) {
        try {
          const lock = await client.getMailboxLock(draftsPath);
          try {
            await client.messageDelete(fields.draftUid, { uid: true });
          } finally {
            lock.release();
          }
        } catch {
          /* noop */
        }
      }

      const result = await client.append(draftsPath, rawMessage, ['\\Draft']);
      return { success: true, uid: result ? (result as any).uid : undefined };
    }, fields.accountId);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Suppression (déplacement vers Corbeille, ou suppression définitive)
  // ══════════════════════════════════════════════════════════════════════

  async deleteMessage(userId: string, kind: MailFolderKind, uid: number, accountId?: string) {
    return this.withClient(userId, async (client) => {
      const path = await this.resolveFolderPath(client, kind);
      const lock = await client.getMailboxLock(path);
      try {
        if (kind === 'trash') {
          await client.messageDelete(uid, { uid: true });
          return { success: true, permanently_deleted: true };
        }
        const trashPath = await this.resolveFolderPath(client, 'trash');
        if (trashPath === path) {
          await client.messageDelete(uid, { uid: true });
          return { success: true, permanently_deleted: true };
        }
        await client.messageMove(uid, trashPath, { uid: true });
        return { success: true, permanently_deleted: false };
      } finally {
        lock.release();
      }
    }, accountId);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Compteur non-lus (pour badge de notification)
  // ══════════════════════════════════════════════════════════════════════

  async getUnreadCount(userId: string): Promise<{ configured: boolean; unread: number }> {
    const account = await this.prisma.mailAccount.findFirst({ where: { user_id: userId, is_primary: true } });
    if (!account || !account.is_active) return { configured: false, unread: 0 };
    try {
      const unread = await this.withClient(userId, async (client) => {
        const status: any = await client.status('INBOX', { unseen: true });
        return status?.unseen || 0;
      });
      return { configured: true, unread };
    } catch {
      return { configured: true, unread: 0 };
    }
  }
}
