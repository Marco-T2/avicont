import { ApiProperty } from '@nestjs/swagger';

import type { MembershipDeTenantParaAdmin } from '@/memberships/ports/memberships-reader.port';

export class PlatformOrgMemberCustomRoleDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class PlatformOrgMemberUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
}

/**
 * DTO de respuesta para un miembro de una organización en el panel super-admin.
 * Shape: espeja MembershipDeTenantParaAdmin con fechas serializadas a ISO string
 * para transporte HTTP (§4.5 — montos en string; aquí fechas idem, sin Money).
 *
 * Cubre REQ-PM-01 (Slice 1 del change platform-admin-v1.1).
 */
export class PlatformOrgMemberResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ type: String, nullable: true }) systemRole!: string | null;
  @ApiProperty({ type: String, nullable: true }) customRoleId!: string | null;
  @ApiProperty({ type: () => PlatformOrgMemberCustomRoleDto, nullable: true })
  customRole!: { id: string; slug: string; name: string } | null;
  /** ISO string o null. FechaContable N/A (es timestamptz de auditoría). */
  @ApiProperty({ type: String, nullable: true }) deactivatedAt!: string | null;
  /** ISO string. */
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: () => PlatformOrgMemberUserDto })
  user!: { id: string; email: string; displayName: string | null };

  /**
   * Mapea directo desde MembershipDeTenantParaAdmin (memberships-reader.port.ts).
   */
  static fromMembership(m: MembershipDeTenantParaAdmin): PlatformOrgMemberResponseDto {
    const dto = new PlatformOrgMemberResponseDto();
    dto.id = m.id;
    dto.userId = m.userId;
    dto.systemRole = m.systemRole;
    dto.customRoleId = m.customRoleId;
    dto.customRole = m.customRole;
    dto.deactivatedAt = m.deactivatedAt ? m.deactivatedAt.toISOString() : null;
    dto.createdAt = m.createdAt.toISOString();
    dto.user = m.user;
    return dto;
  }
}
