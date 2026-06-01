/** Token de inyección NestJS para el repositorio de auditoría de plataforma. */
export const PLATFORM_AUDIT_PORT = Symbol('PLATFORM_AUDIT_PORT');

/**
 * Entrada de auditoría de plataforma.
 * Registra acciones de super-admin que mutan estado o acceden cross-tenant.
 * (REQ-SA-08/09 — docs/disenos/super-admin-plataforma.md §6)
 */
export interface PlatformAuditEntry {
  /** ID del super-admin que ejecutó la acción. */
  actorUserId: string;
  /** Descriptor de la acción, ej: "POST /admin/platform/orgs", "platform.superadmin.grant". */
  action: string;
  /** Org afectada; omitir para acciones org-less o grant/revoke sin org destino. */
  targetOrganizationId?: string;
  /** Cuerpo redactado del request o metadata relevante. */
  payload?: Record<string, unknown>;
  /** Timestamp UTC provisto por ClockPort (CLAUDE.md §4.6 — NUNCA new Date()). */
  createdAt: Date;
}

/**
 * Puerto de escritura de la tabla `platform_audit`.
 *
 * El write es best-effort: si falla, la request principal NO se interrumpe.
 * El caller loguea el error como `warn` y continúa.
 */
export abstract class PlatformAuditPort {
  abstract record(entry: PlatformAuditEntry): Promise<void>;
}
