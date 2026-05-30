/**
 * Errores de dominio del módulo `reportes` — capability Libro Mayor.
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 * El GlobalExceptionFilter los mapea al formato estándar de respuesta (§6.4).
 * Prefijo `LIBRO_MAYOR_*` consistente con el patrón de `libro-diario-errors.ts`.
 */

import { InvalidStateError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 400 — filtros inválidos (REQ-LM-01)
// ============================================================

/**
 * No se recibió ningún filtro de rango, o se recibieron ambas formas
 * simultáneamente (periodoFiscalId + fechaDesde+fechaHasta).
 * REQ-LM-01: exactamente una forma requerida.
 */
export class FiltroRequeridoError extends ValidationError {
  constructor() {
    super(
      'LIBRO_MAYOR_FILTRO_INVALIDO',
      'Se requiere exactamente uno: periodoFiscalId O la dupla fechaDesde+fechaHasta (no ambos, no ninguno)',
    );
  }
}

/**
 * fechaDesde > fechaHasta — rango incoherente.
 * REQ-LM-01: rango de fechas válido requerido.
 */
export class RangoInvalidoError extends ValidationError {
  constructor(fechaDesde: string, fechaHasta: string) {
    super(
      'LIBRO_MAYOR_RANGO_INVALIDO',
      `El rango de fechas es inválido: fechaDesde (${fechaDesde}) debe ser anterior o igual a fechaHasta (${fechaHasta})`,
      { fechaDesde, fechaHasta },
    );
  }
}

/**
 * La cuenta indicada no es de detalle (esDetalle=false) — es agrupadora.
 * REQ-LM-07: solo cuentas con esDetalle=true tienen movimientos directos.
 *
 * Código de Comercio art. 36 + plan de cuentas analítico: solo las cuentas
 * de detalle (hojas del árbol) acumulan débitos y créditos. Las cuentas
 * agrupadores son nodos intermedios cuyo saldo es la suma de sus hijos.
 */
export class CuentaNoDetalleError extends ValidationError {
  constructor(cuentaId: string) {
    super(
      'LIBRO_MAYOR_CUENTA_NO_DETALLE',
      'La cuenta indicada es una cuenta agrupadora y no tiene movimientos directos. Seleccioná una cuenta de detalle.',
      { cuentaId },
    );
  }
}

// ============================================================
// 422 — invariante de tope defensivo (REQ-LM-12)
// ============================================================

/**
 * El rango contiene más líneas que el límite permitido.
 * REQ-LM-12: si > 20.000 líneas → HTTP 422 explícito (no silencioso).
 * El tope mide LÍNEAS (no asientos) porque el Mayor trabaja por línea de cuenta.
 */
export class MovimientosExcedenLimiteError extends InvalidStateError {
  constructor(cantidad: number, limite: number) {
    super(
      'LIBRO_MAYOR_RANGO_EXCEDIDO',
      `El rango solicitado contiene ${cantidad} movimientos, que supera el límite de ${limite}. Acotá el rango de fechas o filtrá por cuenta.`,
      { cantidad, limite },
    );
  }
}

// ============================================================
// 404 — entidades no encontradas
// ============================================================

/**
 * El periodoFiscalId no existe o no pertenece al tenant activo.
 * Defense in depth (CLAUDE.md §4.2): no distinguir "no existe" de "no es tuyo".
 */
export class PeriodoNoEncontradoError extends NotFoundError {
  constructor(periodoFiscalId: string) {
    super(
      'LIBRO_MAYOR_PERIODO_NO_ENCONTRADO',
      'El período fiscal indicado no existe o no pertenece a esta organización',
      { periodoFiscalId },
    );
  }
}

/**
 * El cuentaId no existe o no pertenece al tenant activo.
 * Defense in depth (CLAUDE.md §4.2): no distinguir "no existe" de "no es tuyo".
 */
export class CuentaNoEncontradaError extends NotFoundError {
  constructor(cuentaId: string) {
    super(
      'LIBRO_MAYOR_CUENTA_NO_ENCONTRADA',
      'La cuenta indicada no existe o no pertenece a esta organización',
      { cuentaId },
    );
  }
}
