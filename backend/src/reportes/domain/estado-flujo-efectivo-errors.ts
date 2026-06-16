/**
 * Errores de dominio del módulo `reportes` — capability Estado de Flujo de
 * Efectivo (EFE) por método indirecto.
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 * El GlobalExceptionFilter los mapea al formato estándar de respuesta (§6.4).
 * Prefijo `REPORTES_FLUJO_EFECTIVO_*`.
 *
 * Todos extienden `InvalidStateError` (HTTP 422), igual que el Balance de
 * Comprobación: son violaciones de combinación de parámetros (modo requerido,
 * ambiguo, período inexistente) o de coherencia de rango, no de forma.
 *
 * NIC 7 (Resolución CTNAC 01/2012): el EFE debe acotarse a un período válido.
 */

import { InvalidStateError } from '@/common/errors';

/**
 * No se proporcionó ningún modo de rango (ni `desde`/`hasta` ni `periodoFiscalId`).
 * REQ-FE-01: exactamente uno de los dos modos es requerido.
 */
export class FlujoEfectivoRangoRequeridoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_FLUJO_EFECTIVO_RANGO_REQUERIDO',
      'Debe indicar el rango del Estado de Flujo de Efectivo: desde+hasta o periodoFiscalId',
    );
  }
}

/**
 * Se proporcionaron ambos modos de rango simultáneamente (rango directo Y período).
 * REQ-FE-01: los modos son mutuamente excluyentes.
 */
export class FlujoEfectivoRangoAmbiguoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_FLUJO_EFECTIVO_RANGO_AMBIGUO',
      'Indique el rango por desde+hasta O por periodoFiscalId, no ambos a la vez',
    );
  }
}

/**
 * El rango de fechas es inválido: fecha mal formada o imposible (ej. 2026-02-30),
 * modo rango incompleto (solo `desde` o solo `hasta`), o `desde > hasta`.
 * REQ-FE-02: validación del rango antes de leer saldos.
 */
export class FlujoEfectivoRangoInvalidoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_FLUJO_EFECTIVO_RANGO_INVALIDO',
      'El rango de fechas del Estado de Flujo de Efectivo es inválido',
    );
  }
}

/**
 * No existe un período fiscal con el ID indicado para este tenant.
 *
 * Defense in depth (CLAUDE.md §4.2): no distingue "no existe" de "no es tuyo"
 * para evitar enumeración de ids ajenos.
 * REQ-FE-02: 422 cuando el periodoFiscalId no puede resolverse.
 */
export class FlujoEfectivoPeriodoNoEncontradoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_FLUJO_EFECTIVO_PERIODO_NO_ENCONTRADO',
      'No existe un período fiscal con el ID indicado para este tenant',
    );
  }
}
