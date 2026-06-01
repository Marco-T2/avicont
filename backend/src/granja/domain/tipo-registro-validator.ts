/**
 * Validator puro del dominio de TipoRegistro. Funciones sin side effects,
 * sin acceso a BD, sin NestJS. Testeable en milisegundos.
 *
 * Espeja el patrón de comprobante-validator.ts.
 *
 * Invariantes que cubre:
 *   1. naturaleza INMUTABLE post-creación — al editar (validarEdicionTipoRegistro).
 *   2. esSistema=true: nombre no editable — al editar (validarEdicionTipoRegistro).
 *   3. esSistema=true: no eliminable — al eliminar (validarEliminacionTipoRegistro).
 *
 * Invariantes delegados al service (requieren DB):
 *   - Unicidad de nombre (requiere repo.findByNombre — cicatriz F-01)
 *   - "En uso": countMovimientos > 0 no eliminable (requiere repo.countMovimientos)
 */

import {
  TipoRegistroNaturalezaInmutableError,
  TipoRegistroSistemaNoEditableError,
  TipoRegistroSistemaNoEliminableError,
} from './granja-errors';
import type { TipoRegistroRow } from '../ports/tipo-registro.repository.port';

// ------------------------------------------------------------
// Validadores exportados
// ------------------------------------------------------------

/**
 * Valida los invariantes de edición de un tipo de registro (PATCH).
 * Se invoca en TipoRegistroService.update() DESPUÉS de buscar el row.
 *
 * Orden de chequeos:
 *   1. naturaleza inmutable (aplica para todos los tipos).
 *   2. esSistema: nombre inmutable para tipos de sistema.
 *
 * El campo `activo` es siempre editable (para todos los tipos).
 *
 * @throws {TipoRegistroNaturalezaInmutableError} si el input incluye naturaleza.
 * @throws {TipoRegistroSistemaNoEditableError} si esSistema=true y el input incluye nombre.
 */
export function validarEdicionTipoRegistro(
  tipoRow: TipoRegistroRow,
  input: Record<string, unknown>,
): void {
  if ('naturaleza' in input && input['naturaleza'] !== undefined) {
    throw new TipoRegistroNaturalezaInmutableError(tipoRow.id);
  }

  if (tipoRow.esSistema && input['nombre'] !== undefined) {
    throw new TipoRegistroSistemaNoEditableError(tipoRow.id);
  }
}

/**
 * Valida que el tipo de registro puede eliminarse físicamente.
 * Se invoca en TipoRegistroService.eliminar() DESPUÉS de buscar el row.
 *
 * Solo chequea la regla pura (esSistema). La regla de "en uso"
 * (countMovimientos > 0) requiere una llamada al repo y vive en el service.
 *
 * @throws {TipoRegistroSistemaNoEliminableError} si esSistema=true.
 */
export function validarEliminacionTipoRegistro(tipoRow: TipoRegistroRow): void {
  if (tipoRow.esSistema) {
    throw new TipoRegistroSistemaNoEliminableError(tipoRow.id);
  }
}
