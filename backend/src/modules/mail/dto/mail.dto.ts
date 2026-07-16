import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SetMailAccountDto {
  @ApiProperty({ example: 'ahmed@etcc.ma', description: 'Adresse email professionnelle Hostinger' })
  @IsEmail()
  email_address: string;

  @ApiProperty({ example: 'MotDePasseHostinger2026!', description: 'Mot de passe de la boîte mail (stocké chiffré)' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ example: 'imap.hostinger.com' })
  @IsOptional()
  @IsString()
  imap_host?: string;

  @ApiPropertyOptional({ example: 993 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  imap_port?: number;

  @ApiPropertyOptional({ example: 'smtp.hostinger.com' })
  @IsOptional()
  @IsString()
  smtp_host?: string;

  @ApiPropertyOptional({ example: 465 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtp_port?: number;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'facture' })
  @IsOptional()
  @IsString()
  q?: string;
}

export type MailFolderKind = 'inbox' | 'sent' | 'drafts' | 'trash';

export class SendMailDto {
  @ApiPropertyOptional({ example: 'client@example.com, autre@example.com' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bcc?: string;

  @ApiPropertyOptional({ example: 'Devis n°2026-014' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Corps HTML du message' })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional({ description: 'Corps texte brut (fallback)' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ enum: ['new', 'reply', 'reply_all', 'forward'] })
  @IsOptional()
  @IsIn(['new', 'reply', 'reply_all', 'forward'])
  mode?: 'new' | 'reply' | 'reply_all' | 'forward';

  @ApiPropertyOptional({ description: 'UID du message d\'origine (répondre / transférer)' })
  @IsOptional()
  @IsString()
  source_uid?: string;

  @ApiPropertyOptional({ enum: ['inbox', 'sent', 'drafts', 'trash'] })
  @IsOptional()
  @IsIn(['inbox', 'sent', 'drafts', 'trash'])
  source_folder?: MailFolderKind;
}

export class SaveDraftDto extends SendMailDto {
  @ApiPropertyOptional({ description: 'UID du brouillon existant à remplacer' })
  @IsOptional()
  @IsString()
  draft_uid?: string;
}
