import {
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  FiltroRequeridoError,
  MovimientosExcedenLimiteError,
  PeriodoNoEncontradoError,
  RangoInvalidoError,
} from './libro-mayor-errors';

describe('Libro Mayor — DomainErrors (unit)', () => {
  describe('FiltroRequeridoError', () => {
    it('tiene httpStatus 400 y code LIBRO_MAYOR_FILTRO_INVALIDO', () => {
      const err = new FiltroRequeridoError();
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe('LIBRO_MAYOR_FILTRO_INVALIDO');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('RangoInvalidoError', () => {
    it('tiene httpStatus 400 y code LIBRO_MAYOR_RANGO_INVALIDO con details', () => {
      const err = new RangoInvalidoError('2026-03-31', '2026-03-01');
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe('LIBRO_MAYOR_RANGO_INVALIDO');
      expect(err.details).toMatchObject({ fechaDesde: '2026-03-31', fechaHasta: '2026-03-01' });
    });
  });

  describe('CuentaNoDetalleError', () => {
    it('tiene httpStatus 400 y code LIBRO_MAYOR_CUENTA_NO_DETALLE con details', () => {
      const err = new CuentaNoDetalleError('cuenta-uuid-123');
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe('LIBRO_MAYOR_CUENTA_NO_DETALLE');
      expect(err.details).toMatchObject({ cuentaId: 'cuenta-uuid-123' });
    });
  });

  describe('MovimientosExcedenLimiteError', () => {
    it('tiene httpStatus 422 y code LIBRO_MAYOR_RANGO_EXCEDIDO con details', () => {
      const err = new MovimientosExcedenLimiteError(20001, 20000);
      expect(err.httpStatus).toBe(422);
      expect(err.code).toBe('LIBRO_MAYOR_RANGO_EXCEDIDO');
      expect(err.details).toMatchObject({ cantidad: 20001, limite: 20000 });
    });
  });

  describe('PeriodoNoEncontradoError', () => {
    it('tiene httpStatus 404 y code LIBRO_MAYOR_PERIODO_NO_ENCONTRADO con details', () => {
      const err = new PeriodoNoEncontradoError('periodo-uuid-123');
      expect(err.httpStatus).toBe(404);
      expect(err.code).toBe('LIBRO_MAYOR_PERIODO_NO_ENCONTRADO');
      expect(err.details).toMatchObject({ periodoFiscalId: 'periodo-uuid-123' });
    });
  });

  describe('CuentaNoEncontradaError', () => {
    it('tiene httpStatus 404 y code LIBRO_MAYOR_CUENTA_NO_ENCONTRADA con details', () => {
      const err = new CuentaNoEncontradaError('cuenta-uuid-999');
      expect(err.httpStatus).toBe(404);
      expect(err.code).toBe('LIBRO_MAYOR_CUENTA_NO_ENCONTRADA');
      expect(err.details).toMatchObject({ cuentaId: 'cuenta-uuid-999' });
    });
  });
});
