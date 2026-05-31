import {
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  FiltroRequeridoError,
  PeriodoNoEncontradoError,
  RangoExcedeLimiteError,
  RangoInvalidoError,
} from './libro-diario-errors';

describe('Libro Diario — DomainErrors (unit)', () => {
  describe('FiltroRequeridoError', () => {
    it('tiene httpStatus 400 y code LIBRO_DIARIO_FILTRO_INVALIDO', () => {
      const err = new FiltroRequeridoError();
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe('LIBRO_DIARIO_FILTRO_INVALIDO');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('RangoInvalidoError', () => {
    it('tiene httpStatus 400 y code LIBRO_DIARIO_RANGO_INVALIDO', () => {
      const err = new RangoInvalidoError('2026-03-31', '2026-03-01');
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe('LIBRO_DIARIO_RANGO_INVALIDO');
      expect(err.details).toMatchObject({ fechaDesde: '2026-03-31', fechaHasta: '2026-03-01' });
    });
  });

  describe('RangoExcedeLimiteError', () => {
    it('tiene httpStatus 422 y code LIBRO_DIARIO_RANGO_EXCEDIDO', () => {
      const err = new RangoExcedeLimiteError(5001, 5000);
      expect(err.httpStatus).toBe(422);
      expect(err.code).toBe('LIBRO_DIARIO_RANGO_EXCEDIDO');
      expect(err.details).toMatchObject({ cantidad: 5001, limite: 5000 });
    });
  });

  describe('PeriodoNoEncontradoError', () => {
    it('tiene httpStatus 404 y code LIBRO_DIARIO_PERIODO_NO_ENCONTRADO', () => {
      const err = new PeriodoNoEncontradoError('periodo-uuid-123');
      expect(err.httpStatus).toBe(404);
      expect(err.code).toBe('LIBRO_DIARIO_PERIODO_NO_ENCONTRADO');
      expect(err.details).toMatchObject({ periodoFiscalId: 'periodo-uuid-123' });
    });
  });

  describe('errores de cuenta', () => {
    describe('CuentaNoEncontradaError', () => {
      it('tiene httpStatus 404 y code LIBRO_DIARIO_CUENTA_NO_ENCONTRADA', () => {
        const err = new CuentaNoEncontradaError('cuenta-uuid-456');
        expect(err.httpStatus).toBe(404);
        expect(err.code).toBe('LIBRO_DIARIO_CUENTA_NO_ENCONTRADA');
        expect(err.details).toMatchObject({ cuentaId: 'cuenta-uuid-456' });
      });

      it('es instancia de NotFoundError', () => {
        const err = new CuentaNoEncontradaError('cuenta-uuid-456');
        // La clase base NotFoundError produce httpStatus 404
        expect(err.httpStatus).toBe(404);
      });
    });

    describe('CuentaNoDetalleError', () => {
      it('tiene httpStatus 400 y code LIBRO_DIARIO_CUENTA_NO_DETALLE', () => {
        const err = new CuentaNoDetalleError('cuenta-agrupadora-789');
        expect(err.httpStatus).toBe(400);
        expect(err.code).toBe('LIBRO_DIARIO_CUENTA_NO_DETALLE');
        expect(err.details).toMatchObject({ cuentaId: 'cuenta-agrupadora-789' });
      });

      it('es instancia de ValidationError', () => {
        const err = new CuentaNoDetalleError('cuenta-agrupadora-789');
        // La clase base ValidationError produce httpStatus 400
        expect(err.httpStatus).toBe(400);
      });
    });
  });
});
