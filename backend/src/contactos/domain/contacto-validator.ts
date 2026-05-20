/**
 * Validadores puros del módulo `contactos`. Funciones sin efectos — no
 * tocan BD, no inyectan nada — para que el service y los tests unitarios
 * compartan las mismas reglas (CLAUDE.md §3.5, separación dominio/infra).
 *
 * Las reglas que requieren BD (unicidad de documento, conteo de líneas
 * referenciadoras) viven en `contactos.service.ts`, no acá.
 */

import { ContactoFlagsInvalidosError, ContactoRazonSocialRequeridaError } from './contacto-errors';

// ------------------------------------------------------------
// Normalización
// ------------------------------------------------------------

/**
 * Trimea el documento. Si queda vacío tras trim (o viene null/undefined),
 * devuelve null — así el unique parcial de Postgres lo deja pasar y no
 * bloquea múltiples contactos "sin documento" en el mismo tenant.
 */
export function normalizarDocumento(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Trimea strings opcionales. null/undefined/"   " → null.
 * Para nombreComercial, email, telefono, direccion.
 */
export function normalizarOpcional(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// ------------------------------------------------------------
// Validadores individuales (exportados para tests granulares y reuso)
// ------------------------------------------------------------

export function validarRazonSocial(razonSocial: string): void {
  const longitud = typeof razonSocial === 'string' ? razonSocial.trim().length : 0;
  if (longitud < ContactoRazonSocialRequeridaError.LONGITUD_MINIMA) {
    throw new ContactoRazonSocialRequeridaError(longitud);
  }
}

export function validarFlags(esCliente: boolean, esProveedor: boolean): void {
  if (!esCliente && !esProveedor) {
    throw new ContactoFlagsInvalidosError();
  }
}
