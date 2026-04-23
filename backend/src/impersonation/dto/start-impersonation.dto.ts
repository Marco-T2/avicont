import { IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartImpersonationDto {
  @ApiProperty({ description: 'ID del usuario a impersonar' })
  @IsUUID()
  targetUserId!: string;

  @ApiProperty({
    description:
      'Razón documentada de la impersonation (mínimo 10 caracteres). Queda en el log permanente.',
    example: 'Soporte: usuario reporta no poder ver sus comprobantes de marzo',
  })
  @IsString()
  @MinLength(10)
  reason!: string;
}
