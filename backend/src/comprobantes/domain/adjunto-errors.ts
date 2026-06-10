/**
 * Errores de dominio del sub-recurso `adjuntos` (Pack "contabilidad.adjuntos").
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3):
 *   ADJUNTO_NO_ENCONTRADO          — 404
 *   ADJUNTO_TOPE_COMPROBANTE       — 422 (máximo 10 adjuntos por comprobante)
 *   ADJUNTO_MIME_NO_PERMITIDO      — 422 (tipo de archivo no en whitelist)
 *   ADJUNTO_TAMANO_EXCEDIDO        — 422 (supera el límite de 25 MB)
 *   ADJUNTO_PERIODO_CERRADO        — 422 (período cerrado/bloqueado, §4.4)
 *   ADJUNTO_COMPROBANTE_ANULADO    — 422 (comprobante anulado, adjuntos read-only, §4.7 / D-01)
 */

import { InvalidStateError, NotFoundError } from '@/common/errors';

// ============================================================
// 404 — no encontrado
// ============================================================

export class AdjuntoNoEncontradoError extends NotFoundError {
  constructor(adjuntoId: string) {
    super('ADJUNTO_NO_ENCONTRADO', 'El adjunto no existe', { adjuntoId });
  }
}

// ============================================================
// 422 — reglas de negocio violadas
// ============================================================

export class AdjuntoTopeExcedidoError extends InvalidStateError {
  constructor(tope: number, cantidadActual: number) {
    super(
      'ADJUNTO_TOPE_COMPROBANTE',
      `El comprobante ya tiene ${cantidadActual} adjuntos (máximo ${tope})`,
      { tope, cantidadActual },
    );
  }
}

export class AdjuntoMimeNoPermitidoError extends InvalidStateError {
  constructor(mimeDetectado: string) {
    super('ADJUNTO_MIME_NO_PERMITIDO', `El tipo de archivo no está permitido: ${mimeDetectado}`, {
      mimeDetectado,
    });
  }
}

export class AdjuntoTamanoExcedidoError extends InvalidStateError {
  constructor(tamanoBytes: number, limiteBytes: number) {
    const tamanoMb = (tamanoBytes / 1_048_576).toFixed(1);
    const limiteMb = (limiteBytes / 1_048_576).toFixed(1);
    super(
      'ADJUNTO_TAMANO_EXCEDIDO',
      `El archivo supera el tamaño máximo permitido (${tamanoMb} MB > ${limiteMb} MB)`,
      { tamanoBytes, limiteBytes },
    );
  }
}

/**
 * Se lanza al intentar subir/reemplazar/borrar un adjunto de un comprobante
 * cuyo período fiscal está CERRADO o BLOQUEADO (CLAUDE.md §4.4 / D-02).
 * La lectura (listar/descargar) siempre es libre.
 */
export class AdjuntoPeriodoCerradoError extends InvalidStateError {
  constructor(periodoId: string, estado: string) {
    super(
      'ADJUNTO_PERIODO_CERRADO',
      `No se puede modificar el adjunto: el período fiscal está ${estado}`,
      { periodoId, estadoPeriodo: estado },
    );
  }
}

/**
 * Se lanza al intentar subir/reemplazar/borrar un adjunto de un comprobante
 * ANULADO. CLAUDE.md §4.7 / D-01: el comprobante anulado se congela como
 * evidencia — sus adjuntos quedan en READ-ONLY para mantener coherencia.
 */
export class AdjuntoComprobanteAnuladoError extends InvalidStateError {
  constructor(comprobanteId: string) {
    super(
      'ADJUNTO_COMPROBANTE_ANULADO',
      'No se puede modificar el adjunto: el comprobante está anulado',
      { comprobanteId },
    );
  }
}
