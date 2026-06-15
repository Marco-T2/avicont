import { InvalidStateError } from '@/common/errors';

import {
  PeriodoNoEncontradoError,
  RangoAmbiguoError,
  RangoInvalidoError,
  RangoRequeridoError,
} from './balance-comprobacion-errors';

/**
 * Tests de los errores de dominio del Balance de Comprobación (DR-5).
 *
 * Verifica `code` estable (§6.3), `message` y clase base (todos `InvalidStateError`
 * → HTTP 422, por decisión DR-5 del design: son violaciones de combinación de
 * parámetros, no de forma).
 */
describe('Errores de dominio — Balance de Comprobación', () => {
  describe('RangoRequeridoError', () => {
    it('expone el code REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO y extiende InvalidStateError (422)', () => {
      const error = new RangoRequeridoError();

      expect(error).toBeInstanceOf(InvalidStateError);
      expect(error.code).toBe('REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO');
      expect(error.httpStatus).toBe(422);
      expect(error.message.length).toBeGreaterThan(0);
    });
  });

  describe('RangoAmbiguoError', () => {
    it('expone el code REPORTES_BALANCE_COMPROBACION_RANGO_AMBIGUO y extiende InvalidStateError (422)', () => {
      const error = new RangoAmbiguoError();

      expect(error).toBeInstanceOf(InvalidStateError);
      expect(error.code).toBe('REPORTES_BALANCE_COMPROBACION_RANGO_AMBIGUO');
      expect(error.httpStatus).toBe(422);
      expect(error.message.length).toBeGreaterThan(0);
    });
  });

  describe('RangoInvalidoError', () => {
    it('expone el code REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO y extiende InvalidStateError (422)', () => {
      const error = new RangoInvalidoError();

      expect(error).toBeInstanceOf(InvalidStateError);
      expect(error.code).toBe('REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO');
      expect(error.httpStatus).toBe(422);
      expect(error.message.length).toBeGreaterThan(0);
    });
  });

  describe('PeriodoNoEncontradoError', () => {
    it('expone el code REPORTES_BALANCE_COMPROBACION_PERIODO_NO_ENCONTRADO y extiende InvalidStateError (422)', () => {
      const error = new PeriodoNoEncontradoError();

      expect(error).toBeInstanceOf(InvalidStateError);
      expect(error.code).toBe('REPORTES_BALANCE_COMPROBACION_PERIODO_NO_ENCONTRADO');
      expect(error.httpStatus).toBe(422);
      expect(error.message.length).toBeGreaterThan(0);
    });
  });
});
