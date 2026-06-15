/**
 * Errores de dominio del módulo `reportes` — capability Balance de Comprobación
 * de Sumas y Saldos.
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 * El GlobalExceptionFilter los mapea al formato estándar de respuesta (§6.4).
 * Prefijo `REPORTES_BALANCE_COMPROBACION_*`.
 *
 * Todos extienden `InvalidStateError` (HTTP 422) por decisión DR-5 del design:
 * son violaciones de combinación de parámetros (modo requerido, ambiguo, período
 * inexistente) o de coherencia de rango, no de forma. `RANGO_INVALIDO` también es
 * 422 para alinear con `RangoInvalidoError` del Estado de Resultados y mantener
 * coherencia dentro del módulo (un "rango inválido" no debe ser 400 en un endpoint
 * y 422 en otro).
 */

import { InvalidStateError } from '@/common/errors';

// ============================================================
// 422 — ningún modo de rango provisto (REQ-BC-01)
// ============================================================

/**
 * No se proporcionó ningún modo de rango (ni `desde`/`hasta` ni `periodoFiscalId`).
 * REQ-BC-01: exactamente uno de los dos modos es requerido.
 */
export class RangoRequeridoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO',
      'Debe indicar el rango del Balance de Comprobación: desde+hasta o periodoFiscalId',
    );
  }
}

// ============================================================
// 422 — ambos modos de rango provistos a la vez (REQ-BC-01)
// ============================================================

/**
 * Se proporcionaron ambos modos de rango simultáneamente (rango directo Y período).
 * REQ-BC-01: los modos son mutuamente excluyentes.
 */
export class RangoAmbiguoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_BALANCE_COMPROBACION_RANGO_AMBIGUO',
      'Indique el rango por desde+hasta O por periodoFiscalId, no ambos a la vez',
    );
  }
}

// ============================================================
// 422 — rango inválido (REQ-BC-02)
// ============================================================

/**
 * El rango de fechas es inválido: fecha mal formada o imposible (ej. 2026-02-30),
 * modo rango incompleto (solo `desde` o solo `hasta`), o `desde > hasta`.
 * REQ-BC-02: validación del rango antes de leer saldos.
 */
export class RangoInvalidoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO',
      'El rango de fechas del Balance de Comprobación es inválido',
    );
  }
}

// ============================================================
// 422 — período fiscal no encontrado (REQ-BC-02)
// ============================================================

/**
 * No existe un período fiscal con el ID indicado para este tenant.
 *
 * Defense in depth (CLAUDE.md §4.2): no distingue "no existe" de "no es tuyo"
 * para evitar enumeración de ids ajenos.
 * REQ-BC-02: 422 cuando el periodoFiscalId no puede resolverse.
 */
export class PeriodoNoEncontradoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_BALANCE_COMPROBACION_PERIODO_NO_ENCONTRADO',
      'No existe un período fiscal con el ID indicado para este tenant',
    );
  }
}
