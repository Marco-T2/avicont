import { ConflictError, DomainError, InvalidStateError } from '@/common/errors';

import {
  ComprobanteDocumentoAsociacionPeriodoCerradoError,
  ComprobanteExportRangoExcedidoError,
} from './comprobante-errors';

describe('ComprobanteDocumentoAsociacionPeriodoCerradoError', () => {
  it('expone code estable, httpStatus 409 y details del período', () => {
    const err = new ComprobanteDocumentoAsociacionPeriodoCerradoError(
      'comp-1',
      'periodo-1',
      'CERRADO',
    );

    expect(err.code).toBe('COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO');
    expect(err.httpStatus).toBe(409);
    expect(err.details).toEqual({
      comprobanteId: 'comp-1',
      periodoFiscalId: 'periodo-1',
      periodoStatus: 'CERRADO',
    });
  });

  it('es un DomainError y un ConflictError', () => {
    const err = new ComprobanteDocumentoAsociacionPeriodoCerradoError('c', 'p', 'BLOQUEADO');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(ConflictError);
  });
});

describe('ComprobanteExportRangoExcedidoError (T3.1)', () => {
  it('tiene code estable COMPROBANTE_EXPORT_RANGO_EXCEDIDO', () => {
    const err = new ComprobanteExportRangoExcedidoError(1500, 1000);
    expect(err.code).toBe('COMPROBANTE_EXPORT_RANGO_EXCEDIDO');
  });

  it('tiene httpStatus 422 (InvalidStateError)', () => {
    const err = new ComprobanteExportRangoExcedidoError(1500, 1000);
    expect(err.httpStatus).toBe(422);
  });

  it('expone cantidad y limite en details', () => {
    const err = new ComprobanteExportRangoExcedidoError(1500, 1000);
    expect(err.details).toEqual({ cantidad: 1500, limite: 1000 });
  });

  it('incluye cantidad y limite en el mensaje', () => {
    const err = new ComprobanteExportRangoExcedidoError(1500, 1000);
    expect(err.message).toContain('1500');
    expect(err.message).toContain('1000');
  });

  it('es un DomainError y un InvalidStateError', () => {
    const err = new ComprobanteExportRangoExcedidoError(1500, 1000);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(InvalidStateError);
  });
});
