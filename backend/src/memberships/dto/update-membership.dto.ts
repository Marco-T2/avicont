import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { SystemRole } from '@prisma/client';

const SYSTEM_ROLES = ['OWNER', 'ADMIN'] as const satisfies readonly SystemRole[];

// Exactamente uno de systemRole o customRoleId debe estar presente.
// Pasar systemRole=null + customRoleId=X cambia a rol custom, y viceversa.
export class UpdateMembershipDto {
  @ApiPropertyOptional({ enum: SYSTEM_ROLES, nullable: true })
  @IsOptional()
  @IsIn(SYSTEM_ROLES)
  systemRole?: SystemRole | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  customRoleId?: string | null;
}
