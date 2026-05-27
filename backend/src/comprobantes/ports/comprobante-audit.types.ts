/**
 * Tipos del sistema de auditoría de comprobantes.
 *
 * La tabla `comprobantes_audit` es raw SQL (no modelada por Prisma) y se
 * puebla exclusivamente por triggers Postgres (trg_comprobantes_audit).
 * El adapter usa $queryRaw para leer de ella; estos tipos aseguran el
 * contrato entre la BD y el resto de la aplicación.
 *
 * Columnas confirmadas en BD (\d comprobantes_audit):
 *   id, tabla, operacion, comprobante_id, organization_id, usuario_id,
 *   motivo, durante_reapertura, reapertura_id, datos_antes, datos_despues, ts
 */

/**
 * Shape raw de una fila devuelta por `$queryRaw` sobre `comprobantes_audit`.
 * Las claves son snake_case tal como las devuelve Postgres.
 */
export interface ComprobanteAuditRow {
  id: string;
  tabla: string;
  operacion: string;
  comprobante_id: string;
  organization_id: string;
  usuario_id: string | null;
  motivo: string | null;
  durante_reapertura: boolean;
  reapertura_id: string | null;
  datos_antes: unknown;
  datos_despues: unknown;
  ts: Date;
}

/**
 * Shape camelCase expuesto al servicio y al controller.
 * El adapter mapea `ComprobanteAuditRow` → `ComprobanteAuditEntry`
 * vía `toComprobanteAuditEntry()`.
 */
export interface ComprobanteAuditEntry {
  id: string;
  /** Nombre de la tabla auditada: 'comprobantes' | 'lineas_comprobante' */
  tableName: string;
  /** Operación disparada por el trigger: 'INSERT' | 'UPDATE' | 'DELETE' */
  operation: string;
  /** id del comprobante padre (para lineas, es el comprobanteId). */
  comprobanteId: string;
  organizationId: string;
  /** userId del actor, null para operaciones de seed/migration sin contexto app. */
  userId: string | null;
  /** Motivo opcional pasado vía set_config('app.audit_motivo', ...). */
  motivo: string | null;
  /** true si la TX corrió dentro de una PeriodoFiscalReopening activa. */
  fueDuranteReapertura: boolean;
  /** id del PeriodoFiscalReopening activo, null si no aplica. */
  reaperturaId: string | null;
  /** Snapshot completo del row ANTES del cambio. null en INSERT. */
  rowOld: unknown;
  /** Snapshot completo del row DESPUÉS del cambio. null en DELETE. */
  rowNew: unknown;
  /** Timestamp del evento, formato ISO 8601 UTC. */
  ts: string;
}

/**
 * Mapea una fila raw (snake_case) al shape camelCase del dominio.
 */
export function toComprobanteAuditEntry(row: ComprobanteAuditRow): ComprobanteAuditEntry {
  return {
    id: row.id,
    tableName: row.tabla,
    operation: row.operacion,
    comprobanteId: row.comprobante_id,
    organizationId: row.organization_id,
    userId: row.usuario_id,
    motivo: row.motivo,
    fueDuranteReapertura: row.durante_reapertura,
    reaperturaId: row.reapertura_id,
    rowOld: row.datos_antes,
    rowNew: row.datos_despues,
    ts: row.ts.toISOString(),
  };
}
