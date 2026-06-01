/**
 * Validator puro del dominio de Lote. Funciones sin side effects,
 * sin acceso a BD, sin NestJS, sin reloj. Testeable en milisegundos.
 *
 * Espeja el patrón de comprobante-validator.ts: funciones exportadas que
 * reciben input/row plano y lanzan DomainError si se viola un invariante.
 *
 * Invariantes que cubre:
 *   1. cantidadInicial > 0 y entero — al crear (validarCreacionLote).
 *   2. cantidadInicial INMUTABLE post-creación — al editar (validarEdicionLote).
 *   3. Lote CERRADO no editable — al editar (validarEdicionLote).
 *   4. Lote CERRADO no cerrable dos veces — al cerrar (validarCierreLote).
 *
 * Invariantes delegados al service (requieren DB):
 *   - Not-found (requiere repo.findById)
 *   - avesVivas >= 0 (agregado multi-fila, requiere FOR UPDATE — S4)
 */

import { EstadoLote } from './enums';
import {
  LoteCantidadInicialInmutableError,
  LoteCantidadInicialInvalidaError,
  LoteCerradoError,
  LoteYaCerradoError,
} from './granja-errors';
import type { LoteRow } from '../ports/lote.repository.port';

// ------------------------------------------------------------
// Interfaces de input
// ------------------------------------------------------------

export interface LoteCrearInput {
  cantidadInicial: number;
}

// ------------------------------------------------------------
// Validadores exportados
// ------------------------------------------------------------

/**
 * Valida los invariantes de creación de un lote.
 * Se invoca en LoteService.create() ANTES de llamar al repo.
 *
 * @throws {LoteCantidadInicialInvalidaError} si cantidadInicial no es entero > 0.
 */
export function validarCreacionLote(input: LoteCrearInput): void {
  if (!Number.isInteger(input.cantidadInicial) || input.cantidadInicial <= 0) {
    throw new LoteCantidadInicialInvalidaError(input.cantidadInicial);
  }
}

/**
 * Valida los invariantes de edición de un lote existente (PATCH).
 * Se invoca en LoteService.update() DESPUÉS de buscar el row y ANTES de persistir.
 *
 * Orden de chequeos:
 *   1. cantidadInicial inmutable (no depende del estado, aplica siempre).
 *   2. Lote CERRADO no editable.
 *
 * @throws {LoteCantidadInicialInmutableError} si el input incluye cantidadInicial.
 * @throws {LoteCerradoError} si el lote está CERRADO.
 */
export function validarEdicionLote(loteRow: LoteRow, input: Record<string, unknown>): void {
  if ('cantidadInicial' in input && input['cantidadInicial'] !== undefined) {
    throw new LoteCantidadInicialInmutableError(loteRow.id);
  }

  if (loteRow.estado === EstadoLote.CERRADO) {
    throw new LoteCerradoError(loteRow.id);
  }
}

/**
 * Valida que el lote puede cerrarse (transición ACTIVO → CERRADO).
 * Se invoca en LoteService.cerrar() DESPUÉS de buscar el row.
 *
 * @throws {LoteYaCerradoError} si el lote ya está CERRADO.
 */
export function validarCierreLote(loteRow: LoteRow): void {
  if (loteRow.estado === EstadoLote.CERRADO) {
    throw new LoteYaCerradoError(loteRow.id);
  }
}
