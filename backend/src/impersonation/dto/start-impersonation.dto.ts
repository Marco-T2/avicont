import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    description:
      'ID de la organización target. Solo lo usa el super-admin org-less para ' +
      'especificar en qué organización impersonar. Ignorado si el caller es OWNER ' +
      '(en ese caso se usa el tenant del contexto).',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
