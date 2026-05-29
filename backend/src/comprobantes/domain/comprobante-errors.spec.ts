import { ConflictError, DomainError } from '@/common/errors';

import { ComprobanteDocumentoAsociacionPeriodoCerradoError } from './comprobante-errors';

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
