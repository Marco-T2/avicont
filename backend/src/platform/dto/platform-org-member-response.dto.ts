import type { MembershipDeTenantParaAdmin } from '@/memberships/ports/memberships-reader.port';

/**
 * DTO de respuesta para un miembro de una organización en el panel super-admin.
 * Shape: espeja MembershipDeTenantParaAdmin con fechas serializadas a ISO string
 * para transporte HTTP (§4.5 — montos en string; aquí fechas idem, sin Money).
 *
 * Cubre REQ-PM-01 (Slice 1 del change platform-admin-v1.1).
 */
export class PlatformOrgMemberResponseDto {
  id!: string;
  userId!: string;
  systemRole!: string | null;
  customRoleId!: string | null;
  customRole!: { id: string; slug: string; name: string } | null;
  /** ISO string o null. FechaContable N/A (es timestamptz de auditoría). */
  deactivatedAt!: string | null;
  /** ISO string. */
  createdAt!: string;
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
