/**
 * Token de inyección NestJS para el reader de estadísticas de plataforma.
 */
export const PLATFORM_STATS_READER_PORT = Symbol('PLATFORM_STATS_READER_PORT');

/** Conteo de orgs agrupado por un campo categórico. */
export interface CategoryCount {
  category: string;
  count: number;
}

/** Alta de orgs por mes en el último año. */
export interface AltasPorMes {
  /** Año 4 dígitos. */
  year: number;
  /** Mes 1-12. */
  month: number;
  /** Cantidad de orgs creadas en ese mes. */
  count: number;
}

/**
 * Estructura devuelta por `readDashboard`.
 *
 * `totalUsuarios` está AUSENTE: el service lo obtiene con `prisma.user.count()`
 * directamente (cruce de dominio — users no pertenecen a tenants). El service
 * ensambla el DTO final con ambas piezas.
 */
export interface PlatformDashboardData {
  orgsPorStatus: CategoryCount[];
  orgsPorPlan: CategoryCount[];
  orgsPorVertical: CategoryCount[];
  altasPorMes: AltasPorMes[];
}

/**
 * Puerto de lectura de estadísticas globales de plataforma.
 *
 * ⚠️ EXCEPCIÓN ANTI-31 DELIBERADA: este port agrega datos de TODAS las
 * organizaciones sin filtrar por tenantId. El acceso cross-tenant es
 * intencional — el enforcement está en `SuperAdminGuard`. No agregar filtro
 * de tenant en el adapter.
 */
export abstract class PlatformStatsReaderPort {
  /**
   * Lee los KPIs del dashboard de plataforma.
   *
   * Incluye conteos por status/plan/vertical, total de usuarios del sistema
   * y serie de altas de orgs de los últimos 12 meses.
   *
   * @param windowStart Inicio de la ventana de 12 meses (calculado por el
   * caller usando ClockPort para no violar Anti-20 — new Date() prohibido
   * en domain/services).
   */
  abstract readDashboard(windowStart: Date): Promise<PlatformDashboardData>;
}
