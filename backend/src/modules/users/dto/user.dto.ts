import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Role, Language } from '@prisma/client';

export const ALLOWED_MODULE_KEYS = [
  'devis',
  'bc',
  'bl',
  'invoices',
  'depenses',
  'comptabilite',
  'comptabilite-interne',
  'pdf',
  'messagerie',
] as const;

export class CreateUserDto {
  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  first_name: string;

  @ApiProperty({ example: 'Hilali' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  last_name: string;

  @ApiProperty({ example: 'ahmed', description: 'Login unique (pas d\'espaces ni caractères spéciaux)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9._]+$/, { message: 'Username: lettres minuscules, chiffres, . ou _ uniquement' })
  username: string;

  @ApiPropertyOptional({ example: 'ahmed@etcc.ma' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+212 6 12 34 56 78' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Ahmed2026!', description: 'Mot de passe créé par l\'Admin' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: Role, example: 'EMPLOYE' })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ enum: Language, example: 'FR' })
  @IsOptional()
  @IsEnum(Language)
  preferred_language?: Language;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  last_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(Language)
  preferred_language?: Language;

  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({
    type: [String],
    enum: ALLOWED_MODULE_KEYS,
    isArray: true,
    description: 'Permissions fines par module (override, EMPLOYE uniquement)',
  })
  @IsOptional()
  @IsArray()
  @IsIn(ALLOWED_MODULE_KEYS, { each: true })
  allowed_modules?: string[];
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'NewPassword2026!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}
