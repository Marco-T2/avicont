/**
 * Validator puro del dominio de movimientos de Granja.
 * Funciones sin side effects, sin acceso a BD, sin NestJS. Testeable en
 * milisegundos. Espeja el patrón de lote-validator.ts y tipo-registro-validator.ts.
 *
 * Invariantes que cubre:
 *   1. monto > 0 (MovimientoInversion)
 *   2. TipoRegistro.naturaleza === INVERSION (para inversión)
 *   3. TipoRegistro.activo === true
 *   4. cantidad > 0 y entero (MovimientoCantidad)
 *   5. TipoRegistro.naturaleza === CANTIDAD (para cantidad)
 *   6. detalle ≤ 500 caracteres (ambos)
 *
 * Invariante delegado al service (requiere DB + FOR UPDATE):
 *   - avesVivas >= 0 (agregado multi-fila — S4 design.md §7)
 */

import { Prisma } from '@prisma/client';

import { ValidationError } from '@/common/errors';

import { NaturalezaRegistro } from './enums';
import {
  MovimientoCantidadInvalidaError,
  MovimientoInversionMontoInvalidoError,
  TipoRegistroInactivoError,
  TipoRegistroNaturalezaInvalidaError,
} from './granja-errors';
import type { TipoRegistroRow } from '../ports/tipo-registro.repository.port';

// ============================================================
// Constantes
// ============================================================

const DETALLE_MAX_LENGTH = 500;

// ============================================================
// Interfaces de input
// ============================================================

export interface MovimientoInversionInput {
  monto: string;
  detalle: string | null;
}

export interface MovimientoCantidadInput {
  cantidad: number;
  detalle: string | null;
}

// ============================================================
// Helpers privados
// ============================================================

function validarTipoActivo(tipoRow: TipoRegistroRow): void {
  if (!tipoRow.activo) {
    throw new TipoRegistroInactivoError(tipoRow.id);
  }
}

function validarNaturaleza(tipoRow: TipoRegistroRow, esperada: NaturalezaRegistro): void {
  if (tipoRow.naturaleza !== esperada) {
    throw new TipoRegistroNaturalezaInvalidaError(tipoRow.id, esperada, tipoRow.naturaleza);
  }
}

function validarDetalle(detalle: string | null): void {
  if (detalle !== null && detalle.length > DETALLE_MAX_LENGTH) {
    throw new ValidationError(
      'GRANJA_MOVIMIENTO_DETALLE_DEMASIADO_LARGO',
      `El detalle no puede superar ${DETALLE_MAX_LENGTH} caracteres`,
      { length: detalle.length },
    );
  }
}

// ============================================================
// Validadores exportados
// ============================================================

/**
 * Valida los invariantes de un registro de inversión (monto, naturaleza, activo,
 * detalle). Se invoca en MovimientoService.registrarInversion() ANTES de persistir.
 *
 * @throws {MovimientoInversionMontoInvalidoError} si monto <= 0
 * @throws {TipoRegistroNaturalezaInvalidaError} si tipo.naturaleza !== INVERSION
 * @throws {TipoRegistroInactivoError} si tipo está inactivo
 * @throws {ValidationError} si detalle > 500 chars
 */
export function validarRegistroInversion(
  input: MovimientoInversionInput,
  tipoRow: TipoRegistroRow,
): void {
  // Orden: naturaleza → activo → monto → detalle
  // Naturaleza se valida antes de activo para dar error más descriptivo
  validarNaturaleza(tipoRow, NaturalezaRegistro.INVERSION);
  validarTipoActivo(tipoRow);

  const monto = new Prisma.Decimal(input.monto);
  if (!monto.greaterThan(0)) {
    throw new MovimientoInversionMontoInvalidoError();
  }

  validarDetalle(input.detalle);
}

/**
 * Valida los invariantes de un registro de cantidad (mortalidad).
 * Se invoca en MovimientoService.registrarCantidad() ANTES de verificar avesVivas.
 *
 * @throws {MovimientoCantidadInvalidaError} si cantidad <= 0 o no es entero
 * @throws {TipoRegistroNaturalezaInvalidaError} si tipo.naturaleza !== CANTIDAD
 * @throws {TipoRegistroInactivoError} si tipo está inactivo
 * @throws {ValidationError} si detalle > 500 chars
 */
export function validarRegistroCantidad(
  input: MovimientoCantidadInput,
  tipoRow: TipoRegistroRow,
): void {
  validarNaturaleza(tipoRow, NaturalezaRegistro.CANTIDAD);
  validarTipoActivo(tipoRow);

  if (!Number.isInteger(input.cantidad) || input.cantidad <= 0) {
    throw new MovimientoCantidadInvalidaError(input.cantidad);
  }

  validarDetalle(input.detalle);
}
