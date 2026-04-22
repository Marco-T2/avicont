import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SystemRole } from '@prisma/client';

// Valores válidos del enum Prisma SystemRole. Los exportamos como array literal
// porque class-validator @IsEnum no funciona bien con enums generados por Prisma
// (no son objetos con `Object.entries`). @IsIn con array equivalente sí.
const SYSTEM_ROLES = ['OWNER', 'ADMIN'] as const satisfies readonly SystemRole[];

// TODO(Fase 0.7): Este DTO debe soportar customRoleId para roles personalizados.
// Por ahora acepta únicamente SystemRole (OWNER/ADMIN). La invitación real
// por email se implementa en el módulo invitations (Fase 0.7); este endpoint
// queda como compatibilidad con el flujo "admin agrega miembro existente".
export class InviteUserDto {
  @ApiProperty({ example: 'newuser@example.com', description: 'Email del usuario a agregar' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    enum: SYSTEM_ROLES,
    description: 'Rol de sistema a asignar (OWNER o ADMIN). Para otros roles usar customRoleId.',
  })
  @IsOptional()
  @IsIn(SYSTEM_ROLES)
  systemRole?: SystemRole;

  @ApiPropertyOptional({
    description:
      'ID de un CustomRole de la organización. Exactamente uno de systemRole o customRoleId debe estar presente.',
  })
  @IsOptional()
  @IsString()
  customRoleId?: string;
}
