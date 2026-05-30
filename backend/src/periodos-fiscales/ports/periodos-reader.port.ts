// Port DEFINIDO por periodos-fiscales (dueño del dominio PeriodoFiscal, §3.7
// CLAUDE.md) para lectura cross-módulo. El consumidor principal en Fase 1.3
// es `comprobantes` (resolver periodoFiscalId desde fechaContable al crear y
// editar comprobantes; encontrar el período abierto corriente al anular).
//
// Expone la superficie MÍNIMA: métodos de lookup por fecha y por reapertura
// activa. No se filtran listados, estado cruzado, ni métodos de escritura —
// para eso está PeriodoFiscalRepositoryPort, interno al módulo.

import type { PeriodoFiscalStatus, Prisma } from '@prisma/client';

import type { FechaContable } from '@/common/domain/fecha-contable';

export const PERIODOS_READER_PORT = Symbol('PERIODOS_READER_PORT');

export interface PeriodoLite {
  id: string;
  status: PeriodoFiscalStatus;
}

/**
 * Reapertura activa de un período fiscal: la ventana de tiempo durante la
 * cual se permite editar/anular comprobantes en un período cerrado.
 * Solo contiene los campos que el módulo `comprobantes` necesita para
 * propagar el contexto de auditoría (`reaperturaId`, `reopenedAt`).
 */
export interface ReaperturaActiva {
  id: string;
  reopenedAt: Date;
}

export abstract class PeriodosReaderPort {
  /**
   * Devuelve el período fiscal (cualquier estado) del tenant cuyo (year, month)
   * coincide con la `fecha`. Retorna `null` si no existe ningún período para
   * esa fecha — típicamente porque el tenant no tiene gestión creada que cubra
   * ese año.
   *
   * El consumidor inspecciona `status` para decidir:
   *   - `null`                → el tenant debe crear la gestión primero
   *   - `status !== ABIERTO`  → no se admite edición en ese período
   *   - `status === ABIERTO`  → se puede crear/editar comprobantes
   *
   * Acepta opcionalmente un `tx` de Prisma para formar parte de la transacción
   * del caller (ej. al contabilizar o anular). Si no se pasa, la consulta usa
   * el cliente base.
   */
  abstract obtenerPorFecha(
    tenantId: string,
    fecha: FechaContable,
    tx?: Prisma.TransactionClient,
  ): Promise<PeriodoLite | null>;

  /**
   * Devuelve el rango de fechas calendario (inicio y fin de mes) del período
   * indicado, scoped al tenant (defense in depth §4.2 CLAUDE.md).
   *
   * El rango se deriva de `year` y `month` del período:
   *   - `desde` = primer día del mes a medianoche UTC (año-mes-01T00:00:00Z)
   *   - `hasta` = último día del mes a medianoche UTC (usando el último día
   *     real del mes calendario, ej. 2026-02-28 para febrero)
   *
   * Retorna `null` si:
   *   - No existe un período con ese id para el tenant.
   *   - El período existe pero pertenece a otro tenant (no distingue — ambos
   *     devuelven null para evitar enumeración de ids ajenos).
   *
   * Consumido por `reportes` para resolver `periodoFiscalId → rango de fechas`
   * del Libro Diario (design decisión #4).
   */
  abstract obtenerRangoFechas(
    tenantId: string,
    periodoId: string,
  ): Promise<{ desde: Date; hasta: Date } | null>;

  /**
   * Devuelve la reapertura activa (sin `reclosedAt`) del período indicado,
   * scoped al tenant por defense in depth (§4.2 CLAUDE.md).
   *
   * Retorna `null` si:
   *   - No existe ninguna reapertura para el período.
   *   - Todas las reaperturas están cerradas (`reclosedAt != null`).
   *
   * Si existen múltiples reaperturas activas (caso patológico), devuelve
   * la más reciente ordenando por `reopenedAt DESC`.
   *
   * El consumidor `comprobantes` usa este método para detectar si una
   * operación ocurre durante una reapertura activa y propagar el
   * `reaperturaId` al wrapper `AuditedTransactionRunner` (REQ-COMP-REAPERTURA-01/02).
   *
   * Acepta opcionalmente un `tx` de Prisma para ejecutarse dentro de la
   * transacción del caller.
   */
  abstract obtenerReaperturaActiva(
    tenantId: string,
    periodoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReaperturaActiva | null>;
}
