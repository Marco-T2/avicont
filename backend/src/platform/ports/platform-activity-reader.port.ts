/**
 * Token de inyección NestJS para el reader de actividad de plataforma.
 */
export const PLATFORM_ACTIVITY_READER_PORT = Symbol('PLATFORM_ACTIVITY_READER_PORT');

/**
 * Un ítem de actividad de plataforma resuelto (actor + org por nombre).
 *
 * El campo `payload` está AUSENTE deliberadamente (REQ-PCT-04 — dato sensible,
 * no se expone en el timeline público del super-admin).
 */
export interface PlatformActivityItem {
  id: string;
  action: string;
  actorUserId: string;
  actor: {
    email: string;
    displayName: string | null;
  };
  targetOrganizationId: string | null;
  targetOrganization: {
    name: string;
  } | null;
  createdAt: Date;
}

/** Página de resultados cursor-paginada. */
export interface PlatformActivityPage {
  items: PlatformActivityItem[];
  /** Cursor para la siguiente página; `null` si no hay más resultados. */
  nextCursor: string | null;
}

/** Opciones de consulta para `findRecent`. */
export interface FindRecentOptions {
  limit: number;
  /** Cursor opaco decodificado. Si es undefined, empieza desde el primer ítem. */
  cursor?: { createdAt: Date; id: string };
  /** Si está presente, filtra por la org objetivo. */
  orgId?: string;
}

/**
 * Puerto de lectura del timeline de actividad de plataforma.
 *
 * ⚠️ EXCEPCIÓN ANTI-31 DELIBERADA: este port lee de `platform_audit` sin
 * filtrar por tenantId. El acceso cross-tenant es intencional — el enforcement
 * está en `SuperAdminGuard`. No agregar filtro de tenant en el adapter.
 *
 * Este port es SOLO lectura. La escritura es responsabilidad de `PlatformAuditPort`
 * (REQ-PCT-06 — no mezclar read/write).
 */
export abstract class PlatformActivityReaderPort {
  /**
   * Devuelve la página de actividad más reciente, paginada por cursor.
   *
   * Orden: `createdAt DESC, id DESC` (estable ante inserts concurrentes).
   * Cursor: opaco `base64("<createdAt ISO>|<id>")`.
   * Resolución de actor y org por `include` en la misma query (sin N+1).
   * El campo `payload` NO se selecciona (REQ-PCT-04).
   */
  abstract findRecent(options: FindRecentOptions): Promise<PlatformActivityPage>;
}
