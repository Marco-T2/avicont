import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Acepta una invitación con un user que YA existe y está autenticado.
export class AcceptInvitationDto {
  @ApiProperty({ description: 'Token recibido por email (raw, no hash)' })
  @IsString()
  @Length(32, 128)
  token!: string;
}
