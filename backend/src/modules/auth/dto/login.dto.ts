import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ahmed', description: 'Nom d\'utilisateur' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'Ahmed2026!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
