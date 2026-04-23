// Port DEFINIDO por periodos-fiscales (dueño del dominio PeriodoFiscal, §3.7
// CLAUDE.md) para lectura cross-módulo. El consumidor principal en Fase 1.3
// es `comprobantes` (resolver periodoFiscalId desde fechaContable al crear y
// editar comprobantes; encontrar el período abierto corriente al anular).
//
// Expone la superficie MÍNIMA: un sólo método de lookup por fecha. No se
// filtran listados, estado cruzado, ni métodos de escritura — para eso está
// PeriodoFiscalRepositoryPort, interno al módulo.

import type { PeriodoFiscalStatus, Prisma } from '@prisma/client';

import type { FechaContable } from '@/common/domain/fecha-contable';

export const PERIODOS_READER_PORT = Symbol('PERIODOS_READER_PORT');

export interface PeriodoLite {
  id: string;
  status: PeriodoFiscalStatus;
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
}
