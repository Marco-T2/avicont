/**
 * Errores de dominio del módulo `reportes` — capability Libro Diario.
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 * El GlobalExceptionFilter los mapea al formato estándar de respuesta (§6.4).
 */

import { InvalidStateError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 400 — filtros inválidos (REQ-LD-01)
// ============================================================

/**
 * No se recibió ningún filtro de rango, o se recibieron ambas formas
 * simultáneamente (periodoFiscalId + fechaDesde+fechaHasta).
 * REQ-LD-01: exactamente una forma requerida.
 */
export class FiltroRequeridoError extends ValidationError {
  constructor() {
    super(
      'LIBRO_DIARIO_FILTRO_INVALIDO',
      'Se requiere exactamente uno: periodoFiscalId O la dupla fechaDesde+fechaHasta (no ambos, no ninguno)',
    );
  }
}

/**
 * fechaDesde > fechaHasta — rango incoherente.
 * REQ-LD-01: rango de fechas válido requerido.
 */
export class RangoInvalidoError extends ValidationError {
  constructor(fechaDesde: string, fechaHasta: string) {
    super(
      'LIBRO_DIARIO_RANGO_INVALIDO',
      `El rango de fechas es inválido: fechaDesde (${fechaDesde}) debe ser anterior o igual a fechaHasta (${fechaHasta})`,
      { fechaDesde, fechaHasta },
    );
  }
}

// ============================================================
// 422 — invariante de tope defensivo (REQ-LD-10)
// ============================================================

/**
 * El rango contiene más asientos que el límite permitido.
 * REQ-LD-10: si > 5.000 asientos → HTTP 422 explícito (no silencioso).
 */
export class RangoExcedeLimiteError extends InvalidStateError {
  constructor(cantidad: number, limite: number) {
    super(
      'LIBRO_DIARIO_RANGO_EXCEDIDO',
      `El rango solicitado contiene ${cantidad} asientos, que supera el límite de ${limite}. Acotá el rango de fechas.`,
      { cantidad, limite },
    );
  }
}

// ============================================================
// 404 — período no encontrado (REQ-LD-01)
// ============================================================

/**
 * El periodoFiscalId no existe o no pertenece al tenant activo.
 * Defense in depth (CLAUDE.md §4.2): no distinguir "no existe" de "no es tuyo".
 */
export class PeriodoNoEncontradoError extends NotFoundError {
  constructor(periodoFiscalId: string) {
    super(
      'LIBRO_DIARIO_PERIODO_NO_ENCONTRADO',
      'El período fiscal indicado no existe o no pertenece a esta organización',
      { periodoFiscalId },
    );
  }
}
