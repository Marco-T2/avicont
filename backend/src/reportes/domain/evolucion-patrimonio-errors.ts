/**
 * Errores de dominio del módulo `reportes` — capability Estado de Evolución
 * del Patrimonio Neto (EEPN).
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 * El GlobalExceptionFilter los mapea al formato estándar de respuesta (§6.4).
 * Prefijo `REPORTES_EVOLUCION_PATRIMONIO_*`.
 *
 * NCB art. 36: el EEPN debe estar acotado a un período válido.
 */

import { InvalidStateError, ValidationError } from '@/common/errors';

/**
 * El rango de fechas del EEPN es inválido o no fue proporcionado.
 * Cubre: ninguna forma provista, fecha mal formada, fechaDesde > fechaHasta.
 */
export class RangoInvalidoError extends ValidationError {
  constructor() {
    super(
      'REPORTES_EVOLUCION_PATRIMONIO_RANGO_INVALIDO',
      'El rango de fechas del Estado de Evolución del Patrimonio es inválido o no fue proporcionado',
    );
  }
}

/**
 * No existe un período fiscal con el ID indicado para este tenant.
 * Defense in depth (§4.2): no distingue "no existe" de "no es tuyo".
 */
export class PeriodoNoEncontradoError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_EVOLUCION_PATRIMONIO_SIN_PERIODO',
      'No existe un período fiscal con el ID indicado para este tenant',
    );
  }
}

/**
 * No existe una gestión fiscal con el ID indicado para este tenant.
 * Defense in depth (§4.2): no distingue "no existe" de "no es tuyo".
 */
export class GestionNoEncontradaError extends InvalidStateError {
  constructor() {
    super(
      'REPORTES_EVOLUCION_PATRIMONIO_SIN_GESTION',
      'No existe una gestión fiscal con el ID indicado para este tenant',
    );
  }
}
