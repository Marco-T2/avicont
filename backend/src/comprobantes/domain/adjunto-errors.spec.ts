import {
  AdjuntoComprobanteAnuladoError,
  AdjuntoMimeNoPermitidoError,
  AdjuntoNoEncontradoError,
  AdjuntoPeriodoCerradoError,
  AdjuntoTamanoExcedidoError,
  AdjuntoTopeExcedidoError,
} from './adjunto-errors';
import { DomainError } from '@/common/errors';

/**
 * Verifica la jerarquía y codes de los errores de dominio de adjuntos.
 * TDD RED: escrito antes que `adjunto-errors.ts` exista.
 */
describe('errores de dominio de adjuntos', () => {
  describe('AdjuntoNoEncontradoError', () => {
    it('extiende DomainError', () => {
      const err = new AdjuntoNoEncontradoError('uuid-123');
      expect(err).toBeInstanceOf(DomainError);
    });

    it('tiene code ADJUNTO_NO_ENCONTRADO y httpStatus 404', () => {
      const err = new AdjuntoNoEncontradoError('uuid-123');
      expect(err.code).toBe('ADJUNTO_NO_ENCONTRADO');
      expect(err.httpStatus).toBe(404);
    });
  });

  describe('AdjuntoTopeExcedidoError', () => {
    it('extiende DomainError', () => {
      const err = new AdjuntoTopeExcedidoError(10, 10);
      expect(err).toBeInstanceOf(DomainError);
    });

    it('tiene code ADJUNTO_TOPE_COMPROBANTE y httpStatus 422', () => {
      const err = new AdjuntoTopeExcedidoError(10, 10);
      expect(err.code).toBe('ADJUNTO_TOPE_COMPROBANTE');
      expect(err.httpStatus).toBe(422);
    });

    it('incluye tope y cantidadActual en details', () => {
      const err = new AdjuntoTopeExcedidoError(10, 10);
      expect(err.details).toEqual(expect.objectContaining({ tope: 10, cantidadActual: 10 }));
    });
  });

  describe('AdjuntoMimeNoPermitidoError', () => {
    it('extiende DomainError', () => {
      const err = new AdjuntoMimeNoPermitidoError('application/x-msdownload');
      expect(err).toBeInstanceOf(DomainError);
    });

    it('tiene code ADJUNTO_MIME_NO_PERMITIDO y httpStatus 422', () => {
      const err = new AdjuntoMimeNoPermitidoError('application/x-msdownload');
      expect(err.code).toBe('ADJUNTO_MIME_NO_PERMITIDO');
      expect(err.httpStatus).toBe(422);
    });

    it('incluye el mimeType detectado en details', () => {
      const err = new AdjuntoMimeNoPermitidoError('application/x-msdownload');
      expect(err.details).toEqual(
        expect.objectContaining({ mimeDetectado: 'application/x-msdownload' }),
      );
    });
  });

  describe('AdjuntoTamanoExcedidoError', () => {
    it('extiende DomainError', () => {
      const err = new AdjuntoTamanoExcedidoError(30_000_000, 25_000_000);
      expect(err).toBeInstanceOf(DomainError);
    });

    it('tiene code ADJUNTO_TAMANO_EXCEDIDO y httpStatus 422', () => {
      const err = new AdjuntoTamanoExcedidoError(30_000_000, 25_000_000);
      expect(err.code).toBe('ADJUNTO_TAMANO_EXCEDIDO');
      expect(err.httpStatus).toBe(422);
    });
  });

  describe('AdjuntoPeriodoCerradoError', () => {
    it('extiende DomainError', () => {
      const err = new AdjuntoPeriodoCerradoError('periodo-id', 'CERRADO');
      expect(err).toBeInstanceOf(DomainError);
    });

    it('tiene code ADJUNTO_PERIODO_CERRADO y httpStatus 422', () => {
      const err = new AdjuntoPeriodoCerradoError('periodo-id', 'CERRADO');
      expect(err.code).toBe('ADJUNTO_PERIODO_CERRADO');
      expect(err.httpStatus).toBe(422);
    });
  });

  describe('AdjuntoComprobanteAnuladoError', () => {
    it('extiende DomainError', () => {
      const err = new AdjuntoComprobanteAnuladoError('comp-id');
      expect(err).toBeInstanceOf(DomainError);
    });

    it('tiene code ADJUNTO_COMPROBANTE_ANULADO y httpStatus 422', () => {
      const err = new AdjuntoComprobanteAnuladoError('comp-id');
      expect(err.code).toBe('ADJUNTO_COMPROBANTE_ANULADO');
      expect(err.httpStatus).toBe(422);
    });
  });
});
