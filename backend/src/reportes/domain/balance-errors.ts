/**
 * Errores de dominio del módulo `reportes` — capability Balance General.
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 * El GlobalExceptionFilter los mapea al formato estándar de respuesta (§6.4).
 * Prefijo `REPORTES_BALANCE_*` consistente con el patrón de `libro-mayor-errors.ts`.
 *
 * NCB art. 36: el Balance debe estar asociado a una gestión fiscal activa.
 */

import { InvalidStateError, ValidationError } from '@/common/errors';

// ============================================================
// 400 — fecha de corte inválida (REQ-BG-01)
// ============================================================

/**
 * La fecha de corte no tiene el formato YYYY-MM-DD requerido.
 * REQ-BG-01: fecha es requerida y debe tener formato YYYY-MM-DD.
 */
export class FechaCorteInvalidaError extends ValidationError {
  constructor() {
    super('REPORTES_BALANCE_FECHA_INVALIDA', 'La fecha de corte debe tener formato YYYY-MM-DD');
  }
}

// ============================================================
// 422 — gestión fiscal no encontrada (REQ-BG-02)
// ============================================================

/**
 * No existe una gestión fiscal del tenant que cubra la fecha de corte indicada,
 * o el gestionId provisto no existe/no pertenece al tenant.
 *
 * Defense in depth (CLAUDE.md §4.2): no distingue "no existe" de "no es tuyo".
 *
 * NCB art. 36: el Balance debe estar asociado a una gestión fiscal activa.
 * REQ-BG-02: 422 cuando la gestión no puede inferirse desde la fecha.
 */
export class GestionNoEncontradaError extends InvalidStateError {
  constructor(fecha: string) {
    super(
      'REPORTES_BALANCE_SIN_GESTION',
      'No existe una gestión fiscal que cubra la fecha indicada',
      { fecha },
    );
  }
}
