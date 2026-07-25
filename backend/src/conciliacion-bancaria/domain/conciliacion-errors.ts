/**
 * Errores de dominio del WORKSPACE de conciliación (slice 5): consulta del
 * panel, confirmar/deshacer matches (REQ-CB-17) e ignorar/des-ignorar
 * movimientos (REQ-CB-18).
 *
 * Los `code` son IDs ESTABLES hacia el cliente, formato
 * `CONCILIACION_{SUBDOMINIO}_{CONDICION}` (CLAUDE.md §6.3).
 */

import { ConflictError, InvalidStateError, NotFoundError } from '@/common/errors';

// ============================================================
// 404 — recurso no existente (o no visible para el tenant actual, REQ-CB-13)
// ============================================================

export class MovimientoBancarioNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('CONCILIACION_MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe', { id });
  }
}

export class MatchConciliacionNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('CONCILIACION_MATCH_NO_ENCONTRADO', 'El match de conciliación no existe', { id });
  }
}

// ============================================================
// 409 — conflictos de unicidad 1↔1 (REQ-CB-17)
// ============================================================

/**
 * REQ-CB-17: una línea contable se reclama a lo sumo una vez
 * (`@@unique([organizationId, comprobanteId, orden])`). Solo se lanza cuando
 * el match existente tiene el vínculo SANO — si está roto, `crearMatch` lo
 * reemplaza en vez de fallar (design §2.4).
 */
export class LineaYaConciliadaError extends ConflictError {
  constructor(comprobanteId: string, orden: number) {
    super(
      'CONCILIACION_LINEA_YA_CONCILIADA',
      'Esta línea contable ya está conciliada con otro movimiento bancario',
      { comprobanteId, orden },
    );
  }
}

/**
 * REQ-CB-17 escenario 2: un movimiento tiene a lo sumo un match
 * (`@@unique([organizationId, movimientoBancarioId])`).
 *
 * Código PROPIO y distinto de `CONCILIACION_MOVIMIENTO_YA_CONCILIADO` (422,
 * REQ-CB-18): el spec no fija código para este escenario, y reusar el de
 * REQ-CB-18 haría que el mismo `code` viajara con dos status HTTP distintos
 * (409 acá, 422 allá) — un código estable no puede significar dos cosas.
 */
export class MovimientoYaTieneMatchError extends ConflictError {
  constructor(movimientoBancarioId: string) {
    super(
      'CONCILIACION_MOVIMIENTO_YA_TIENE_MATCH',
      'Este movimiento bancario ya está conciliado. Deshacé el match existente antes de crear otro.',
      { movimientoBancarioId },
    );
  }
}

// ============================================================
// 422 — estado inválido para la operación solicitada
// ============================================================

/**
 * REQ-CB-18 escenario 4: un movimiento con match de vínculo SANO no puede
 * pasar directo a `IGNORADO` — primero hay que deshacer el match (REQ-CB-17),
 * para que nunca quede simultáneamente "conciliado" e "ignorado".
 */
export class MovimientoYaConciliadoError extends InvalidStateError {
  constructor(id: string) {
    super(
      'CONCILIACION_MOVIMIENTO_YA_CONCILIADO',
      'El movimiento está conciliado. Deshacé el match antes de ignorarlo.',
      { id },
    );
  }
}

export type MotivoLineaNoConciliable =
  | 'LINEA_INEXISTENTE'
  | 'COMPROBANTE_ANULADO'
  | 'COMPROBANTE_NO_CONTABILIZADO'
  | 'CUENTA_DISTINTA';

/**
 * REQ-CB-17: la línea contra la que se confirma DEBE existir, pertenecer a la
 * cuenta del plan vinculada a la `CuentaBancaria` y estar efectivamente
 * contabilizada y no anulada — un BORRADOR no movió plata y un anulado dejó
 * de moverla (§4.7 core), ninguno de los dos es conciliable.
 */
export class LineaNoConciliableError extends InvalidStateError {
  constructor(comprobanteId: string, orden: number, motivo: MotivoLineaNoConciliable) {
    const mensajes: Record<MotivoLineaNoConciliable, string> = {
      LINEA_INEXISTENTE: 'La línea contable indicada no existe',
      COMPROBANTE_ANULADO: 'El comprobante está anulado y no puede conciliarse',
      COMPROBANTE_NO_CONTABILIZADO:
        'El comprobante no está contabilizado y todavía no puede conciliarse',
      CUENTA_DISTINTA:
        'La línea contable no pertenece a la cuenta del plan de esta cuenta bancaria',
    };
    super('CONCILIACION_LINEA_NO_CONCILIABLE', mensajes[motivo], { comprobanteId, orden, motivo });
  }
}

/** El rango del workspace es obligatorio y `desde` no puede ser posterior a `hasta`. */
export class RangoConciliacionInvalidoError extends InvalidStateError {
  constructor(desde: string, hasta: string) {
    super(
      'CONCILIACION_RANGO_INVALIDO',
      'El rango de fechas es inválido: "desde" no puede ser posterior a "hasta"',
      { desde, hasta },
    );
  }
}

/**
 * REQ-VMB-01 escenario 2: el rango del listado cross-cuenta del verificador
 * es obligatorio y `desde` no puede ser posterior a `hasta`. Código PROPIO
 * (no reusa `CONCILIACION_RANGO_INVALIDO`): son endpoints distintos y un
 * código estable no debe ambiguar su origen.
 */
export class ListadoMovimientosRangoInvalidoError extends InvalidStateError {
  constructor(desde: string, hasta: string) {
    super(
      'CONCILIACION_LISTADO_RANGO_INVALIDO',
      'El rango de fechas es inválido: "desde" no puede ser posterior a "hasta"',
      { desde, hasta },
    );
  }
}
