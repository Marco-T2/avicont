/**
 * Errores de dominio del módulo `documentos-fisicos`. Subclases de
 * DomainError que el GlobalExceptionFilter mapea al formato estándar de
 * respuesta (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 404 — recurso no existente (o no visible para el tenant actual)
// ============================================================

export class DocumentoFisicoNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('DOCUMENTO_FISICO_NO_ENCONTRADO', 'El documento físico no existe', { id });
  }
}

// ============================================================
// 409 — conflictos de estado / unicidad / integridad referencial
// ============================================================

export class DocumentoFisicoNumeroDuplicadoError extends ConflictError {
  constructor(numero: string, tipoDocumentoFisicoId: string) {
    super(
      'DOCUMENTO_FISICO_NUMERO_DUPLICADO',
      `Ya existe un documento con el número '${numero}' para ese tipo en esta organización`,
      { numero, tipoDocumentoFisicoId },
    );
  }
}

export class DocumentoFisicoInmutablePorComprobanteContabilizadoError extends ConflictError {
  constructor(documentoFisicoId: string, comprobanteContabilizadoId: string) {
    super(
      'DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO',
      'El documento físico no puede editarse porque está vinculado a un comprobante contabilizado',
      { documentoFisicoId, comprobanteContabilizadoId },
    );
  }
}

export class DocumentoFisicoReferenciadoPorComprobanteError extends ConflictError {
  constructor(documentoFisicoId: string, comprobanteId: string, estado: string) {
    super(
      'DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE',
      'El documento físico no puede eliminarse porque está referenciado por un comprobante',
      { documentoFisicoId, comprobanteId, estado },
    );
  }
}

export class DocumentoFisicoConHistorialError extends ConflictError {
  constructor(documentoFisicoId: string) {
    super(
      'DOCUMENTO_FISICO_CON_HISTORIAL',
      'El documento físico no puede eliminarse porque tiene historial de asociaciones contables',
      { documentoFisicoId },
    );
  }
}

// ============================================================
// 400 — input del cliente mal formado
// ============================================================

/**
 * Wrapper que el service levanta cuando la construcción del VO
 * `NumeroDocumento` falla (RangeError local). Mapea al code estable
 * único `DOCUMENTO_FISICO_NUMERO_FORMATO_INVALIDO` (HTTP 400) sin
 * exponer la sub-clasificación interna del VO.
 */
export class DocumentoFisicoNumeroFormatoInvalidoError extends ValidationError {
  constructor(numero: string) {
    super(
      'DOCUMENTO_FISICO_NUMERO_FORMATO_INVALIDO',
      'El número del documento solo puede contener letras mayúsculas, dígitos y los caracteres . / -',
      { numero },
    );
  }
}

// ============================================================
// 422 — Ajuste 1: monto y moneda condicionales según esTributario
// ============================================================

/**
 * Tipo de documento `esTributario = true` requiere `monto` y `moneda` no
 * nulos en el payload. `campo` indica cuál de los dos faltó.
 *
 * Cubre REQ-D-13.
 */
export class DocumentoFisicoMontoRequeridoParaTributarioError extends InvalidStateError {
  constructor(campo: 'monto' | 'moneda') {
    super(
      'DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO',
      'El tipo de documento tributario requiere monto y moneda',
      { campo },
    );
  }
}

/**
 * Tipo de documento `esTributario = false` exige `monto` y `moneda` nulos
 * — el monto vive en el Comprobante. `campo` indica cuál de los dos
 * sobra en el payload.
 *
 * Cubre REQ-D-14.
 */
export class DocumentoFisicoMontoNoPermitidoParaNoTributarioError extends InvalidStateError {
  constructor(campo: 'monto' | 'moneda') {
    super(
      'DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO',
      'El tipo de documento no tributario no debe llevar monto ni moneda',
      { campo },
    );
  }
}
