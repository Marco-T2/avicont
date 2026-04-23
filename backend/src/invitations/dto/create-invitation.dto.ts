import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SystemRole } from '@prisma/client';

const SYSTEM_ROLES = ['OWNER', 'ADMIN'] as const satisfies readonly SystemRole[];

// Mismo patrón XOR que Membership: o systemRole o customRoleId, exactamente uno.
export class CreateInvitationDto {
  @ApiProperty({ example: 'nuevo@ejemplo.bo' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: SYSTEM_ROLES, description: 'OWNER o ADMIN' })
  @IsOptional()
  @IsIn(SYSTEM_ROLES)
  systemRole?: SystemRole;

  @ApiPropertyOptional({ description: 'ID de un CustomRole de la organización' })
  @IsOptional()
  @IsString()
  customRoleId?: string;

  @ApiPropertyOptional({
    description: 'Días hasta vencimiento (default 7, máx 30)',
    minimum: 1,
    maximum: 30,
    default: 7,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
