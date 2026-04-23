import { IsOptional, IsString, Length, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Acepta una invitación CREANDO una cuenta nueva al mismo tiempo.
// Endpoint público: el token es la única autorización.
export class AcceptAndRegisterDto {
  @ApiProperty({ description: 'Token recibido por email' })
  @IsString()
  @Length(32, 128)
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 80)
  displayName?: string;
}
