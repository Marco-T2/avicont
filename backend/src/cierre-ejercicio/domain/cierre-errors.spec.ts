import { CierreGestionCerradaError } from '@/comprobantes/domain/comprobante-errors';

import {
  CierreConfigCuentaFaltanteError,
  CierrePartidaDobleError,
  CierrePeriodoNoListoError,
  CierreSinResultadoError,
  CierreYaParcialmenteContabilizadoError,
  CierreGestionNoEncontradaError,
  CierreGestionCerradaError as CierreGestionCerradaErrorReexport,
} from './cierre-errors';

describe('Errores de dominio del cierre del ejercicio', () => {
  describe('CierreGestionNoEncontradaError', () => {
    it('tiene el code estable y HTTP 404', () => {
      const error = new CierreGestionNoEncontradaError('gestion-1');
      expect(error.code).toBe('CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA');
      expect(error.httpStatus).toBe(404);
      expect(error.details).toMatchObject({ gestionId: 'gestion-1' });
    });
  });

  describe('CierreGestionCerradaError', () => {
    it('reexporta el error canónico del módulo comprobantes (mismo code, sin duplicar)', () => {
      // El code CIERRE_EJERCICIO_GESTION_YA_CERRADA es ÚNICO en todo el sistema:
      // el módulo cierre-ejercicio reexporta la clase definida en comprobantes
      // para evitar dos clases con el mismo code (Batch 2 ya la creó).
      expect(CierreGestionCerradaErrorReexport).toBe(CierreGestionCerradaError);
      const error = new CierreGestionCerradaErrorReexport('gestion-1');
      expect(error.code).toBe('CIERRE_EJERCICIO_GESTION_YA_CERRADA');
      expect(error.httpStatus).toBe(409);
    });
  });

  describe('CierreYaParcialmenteContabilizadoError', () => {
    it('tiene el code estable y HTTP 409 con gestionId en details', () => {
      const error = new CierreYaParcialmenteContabilizadoError('gestion-1');
      expect(error.code).toBe('CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO');
      expect(error.httpStatus).toBe(409);
      expect(error.details).toMatchObject({ gestionId: 'gestion-1' });
    });

    it('sin gestionId no expone details', () => {
      const error = new CierreYaParcialmenteContabilizadoError();
      expect(error.details).toBeUndefined();
    });
  });

  describe('CierrePeriodoNoListoError', () => {
    it('tiene el code estable y HTTP 409', () => {
      const error = new CierrePeriodoNoListoError();
      expect(error.code).toBe('CIERRE_EJERCICIO_PERIODO_NO_LISTO');
      expect(error.httpStatus).toBe(409);
    });
  });

  describe('CierreSinResultadoError', () => {
    it('tiene el code estable y HTTP 422', () => {
      const error = new CierreSinResultadoError();
      expect(error.code).toBe('CIERRE_EJERCICIO_SIN_MOVIMIENTO');
      expect(error.httpStatus).toBe(422);
    });
  });

  describe('CierreConfigCuentaFaltanteError', () => {
    it('tiene el code estable y HTTP 422', () => {
      const error = new CierreConfigCuentaFaltanteError('resultadoEjercicioId');
      expect(error.code).toBe('CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE');
      expect(error.httpStatus).toBe(422);
      expect(error.details).toMatchObject({ campoFaltante: 'resultadoEjercicioId' });
    });
  });

  describe('CierrePartidaDobleError', () => {
    it('tiene el code estable y HTTP 500 (bug de dominio)', () => {
      const error = new CierrePartidaDobleError('80000.00', '79000.00', '1000.00');
      expect(error.code).toBe('CIERRE_EJERCICIO_PARTIDA_DOBLE');
      expect(error.httpStatus).toBe(500);
      expect(error.details).toMatchObject({
        totalDebitoBob: '80000.00',
        totalCreditoBob: '79000.00',
        diffBob: '1000.00',
      });
    });
  });
});
