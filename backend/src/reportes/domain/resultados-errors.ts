/**
 * Errores de dominio del módulo `reportes` — capability Estado de Resultados.
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 * El GlobalExceptionFilter los mapea al formato estándar de respuesta (§6.4).
 * Prefijo `REPORTES_RESULTADOS_*`.
 *
 * NCB art. 36: el Estado de Resultados debe estar acotado a un período válido.
 */

import { InvalidStateError, ValidationError } from '@/common/errors';

// ============================================================
// 400 — rango de fechas inválido (REQ-ER-01)
// ============================================================

/**
 * El rango de fechas del Estado de Resultados es inválido o no fue proporcionado.
 * Cubre: ninguna forma provista, múltiples formas sin rango válido,
 * fecha mal formada, fechaDesde > fechaHasta.
 * REQ-ER-01: exactamente una forma es requerida; fechaDesde ≤ fechaHasta.
 */
export class RangoInvalidoError extends ValidationError {
  constructor() {
    super(
      'REPORTES_RESULTADOS_RANGO_INVALIDO',
      'El rango de fechas del Estado de Resultados es inválido o no fue proporcionado',
    );
  }
}

// ============================================================
// 422 — período fiscal no encontrado (REQ-ER-01)
// ============================================================

/**
 * No existe un período fiscal con el ID indicado para este tenant.
 *
 * Defense in depth (CLAUDE.md §4.2): no distingue "no existe" de "no es tuyo".
 *
 * NCB art. 36: el Estado de Resultados debe estar acotado a un período válido.
 * REQ-ER-01: 422 cuando el periodoFiscalId no puede resolverse.
 */
export class PeriodoNoEncontradoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_RESULTADOS_SIN_PERIODO',
      'No existe un período fiscal con el ID indicado para este tenant',
    );
  }
}

// ============================================================
// 422 — gestión fiscal no encontrada (REQ-ER-01)
// ============================================================

/**
 * No existe una gestión fiscal con el ID indicado para este tenant.
 *
 * Defense in depth (CLAUDE.md §4.2): no distingue "no existe" de "no es tuyo".
 *
 * NCB art. 36: el Estado de Resultados debe estar acotado a una gestión válida.
 * REQ-ER-01: 422 cuando el gestionId no puede resolverse.
 */
export class GestionNoEncontradaError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_RESULTADOS_SIN_GESTION',
      'No existe una gestión fiscal con el ID indicado para este tenant',
    );
  }
}
