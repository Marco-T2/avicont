import { ConflictError, DomainError, InvalidStateError } from '@/common/errors';

import {
  CierreComprobanteNoEditableError,
  CierreComprobanteNoEliminableError,
  CierreGestionCerradaError,
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

describe('CierreComprobanteNoEditableError (REQ-CMP-SYS-02/05)', () => {
  it('tiene code estable COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE y httpStatus 409', () => {
    const err = new CierreComprobanteNoEditableError('comp-1');
    expect(err.code).toBe('COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE');
    expect(err.httpStatus).toBe(409);
  });

  it('expone el id en details', () => {
    const err = new CierreComprobanteNoEditableError('comp-1');
    expect(err.details).toEqual({ id: 'comp-1' });
  });

  it('es un DomainError y un ConflictError', () => {
    const err = new CierreComprobanteNoEditableError('comp-1');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(ConflictError);
  });
});

describe('CierreComprobanteNoEliminableError (REQ-CMP-SYS-03)', () => {
  it('tiene code estable COMPROBANTE_GENERADO_SISTEMA_NO_ELIMINABLE y httpStatus 409', () => {
    const err = new CierreComprobanteNoEliminableError('comp-1');
    expect(err.code).toBe('COMPROBANTE_GENERADO_SISTEMA_NO_ELIMINABLE');
    expect(err.httpStatus).toBe(409);
  });

  it('expone el id en details', () => {
    const err = new CierreComprobanteNoEliminableError('comp-1');
    expect(err.details).toEqual({ id: 'comp-1' });
  });

  it('es un DomainError y un ConflictError', () => {
    const err = new CierreComprobanteNoEliminableError('comp-1');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(ConflictError);
  });
});

describe('CierreGestionCerradaError (REQ-CMP-SYS-06)', () => {
  it('tiene code estable CIERRE_EJERCICIO_GESTION_YA_CERRADA y httpStatus 409', () => {
    const err = new CierreGestionCerradaError('gestion-1');
    expect(err.code).toBe('CIERRE_EJERCICIO_GESTION_YA_CERRADA');
    expect(err.httpStatus).toBe(409);
  });

  it('expone el gestionId en details cuando se pasa', () => {
    const err = new CierreGestionCerradaError('gestion-1');
    expect(err.details).toEqual({ gestionId: 'gestion-1' });
  });

  it('sin gestionId → details no aparece', () => {
    const err = new CierreGestionCerradaError();
    expect(err.details).toBeUndefined();
  });

  it('es un DomainError y un ConflictError', () => {
    const err = new CierreGestionCerradaError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(ConflictError);
  });
});
