/**
 * Errores de dominio del módulo `contactos`. Subclases de DomainError que
 * el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 *
 * Las reglas de negocio que levantan estos errores viven en:
 *   - contacto-validator.ts (razón social, flags)
 *   - contactos.service.ts (unicidad de documento, referencias en líneas)
 */

import { ConflictError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 404 — recurso no existente (o no visible para el tenant actual)
// ============================================================

export class ContactoNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('CONTACTO_NO_ENCONTRADO', 'El contacto no existe', { id });
  }
}

// ============================================================
// 409 — conflictos de estado / unicidad
// ============================================================

export class ContactoDocumentoDuplicadoError extends ConflictError {
  constructor(documento: string, contactoExistenteId: string) {
    super(
      'CONTACTO_DOCUMENTO_DUPLICADO',
      `Ya existe un contacto con el documento "${documento}" en esta organización`,
      { documento, contactoExistenteId },
    );
  }
}

export class ContactoReferenciadoError extends ConflictError {
  constructor(id: string, lineasCount: number) {
    super(
      'CONTACTO_REFERENCIADO',
      'No se puede eliminar el contacto porque está referenciado por líneas de comprobante. Desactivalo en su lugar.',
      { id, lineasCount },
    );
  }
}

// ============================================================
// 400 — input del cliente mal formado
// ============================================================

export class ContactoRazonSocialRequeridaError extends ValidationError {
  static readonly LONGITUD_MINIMA = 2;

  constructor(longitudRecibida: number) {
    super(
      'CONTACTO_RAZON_SOCIAL_REQUERIDA',
      `La razón social es obligatoria y debe tener al menos ${ContactoRazonSocialRequeridaError.LONGITUD_MINIMA} caracteres`,
      { longitudRecibida, longitudMinima: ContactoRazonSocialRequeridaError.LONGITUD_MINIMA },
    );
  }
}

export class ContactoFlagsInvalidosError extends ValidationError {
  constructor() {
    super(
      'CONTACTO_FLAGS_INVALIDOS',
      'Un contacto debe ser cliente, proveedor, o ambos. Al menos uno de los flags debe estar activo.',
    );
  }
}
