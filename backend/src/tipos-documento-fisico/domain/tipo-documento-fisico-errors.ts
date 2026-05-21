/**
 * Errores de dominio del módulo `tipos-documento-fisico`. Subclases de
 * DomainError que el GlobalExceptionFilter mapea al formato estándar de
 * respuesta (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { ConflictError, InvalidStateError, NotFoundError } from '@/common/errors';

// ============================================================
// 404 — recurso no existente (o no visible para el tenant actual)
// ============================================================

export class TipoDocumentoFisicoNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('TIPO_DOCUMENTO_FISICO_NO_ENCONTRADO', 'El tipo de documento físico no existe', { id });
  }
}

// ============================================================
// 409 — conflictos de estado / unicidad
// ============================================================

export class TipoDocumentoFisicoCodigoDuplicadoError extends ConflictError {
  constructor(codigo: string) {
    super(
      'TIPO_DOCUMENTO_FISICO_CODIGO_DUPLICADO',
      `Ya existe un tipo con el código '${codigo}' en esta organización`,
      { codigo },
    );
  }
}

export class TipoDocumentoFisicoNombreDuplicadoError extends ConflictError {
  constructor(nombre: string) {
    super(
      'TIPO_DOCUMENTO_FISICO_NOMBRE_DUPLICADO',
      `Ya existe un tipo con el nombre '${nombre}' en esta organización`,
      { nombre },
    );
  }
}

export class TipoDocumentoFisicoConDocumentosError extends ConflictError {
  /**
   * `documentosCount` es opcional: el service hace pre-check (count
   * conocido) y lo incluye; si el adapter atrapa el FK Restrict tras un
   * delete fallido evita re-contar y `details` lo omite.
   */
  constructor(id: string, documentosCount?: number) {
    super(
      'TIPO_DOCUMENTO_FISICO_CON_DOCUMENTOS',
      'No se puede eliminar el tipo porque tiene documentos físicos asociados. Desactivalo en su lugar.',
      documentosCount !== undefined ? { id, documentosCount } : { id },
    );
  }
}

// ============================================================
// 422 — estado inválido para la operación solicitada
// ============================================================

export class TipoDocumentoFisicoInactivoError extends InvalidStateError {
  constructor(id: string, codigo: string) {
    super(
      'TIPO_DOCUMENTO_FISICO_INACTIVO',
      `El tipo de documento '${codigo}' está inactivo y no puede usarse para nuevos documentos`,
      { id, codigo },
    );
  }
}
