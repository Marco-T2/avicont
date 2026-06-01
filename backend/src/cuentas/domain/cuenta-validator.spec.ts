import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import { CuentaErrorCode } from './cuenta-errors';
import {
  calcularNivelDesdeCodigo,
  MAX_NIVELES_CODIGO_INTERNO,
  naturalezaDefaultParaClase,
  naturalezaOpuesta,
  validarCodigoInterno,
  validarConsistenciaClaseSubclase,
  validarContrariaNaturaleza,
} from './cuenta-validator';

describe('cuenta-validator (puro)', () => {
  describe('validarCodigoInterno', () => {
    it('acepta código de 5 niveles con segmentos numéricos', () => {
      const resultado = validarCodigoInterno('1.1.1.001.01');
      expect(resultado.valido).toBe(true);
    });

    it('rechaza código con más de 8 niveles', () => {
      const resultado = validarCodigoInterno('1.1.1.001.01.001.001.001.001');
      expect(resultado).toEqual({
        valido: false,
        error: expect.objectContaining({ code: CuentaErrorCode.NIVEL_MAXIMO_EXCEDIDO }),
      });
    });

    it('rechaza segmento no numérico', () => {
      const resultado = validarCodigoInterno('1.a.1');
      expect(resultado).toEqual({
        valido: false,
        error: expect.objectContaining({ code: CuentaErrorCode.CODIGO_INTERNO_INVALIDO }),
      });
    });

    it('rechaza segmento vacío (punto doble)', () => {
      const resultado = validarCodigoInterno('1..1');
      expect(resultado).toEqual({
        valido: false,
        error: expect.objectContaining({ code: CuentaErrorCode.CODIGO_INTERNO_INVALIDO }),
      });
    });

    it('rechaza código vacío', () => {
      const resultado = validarCodigoInterno('');
      expect(resultado.valido).toBe(false);
    });

    it('acepta código de 1 nivel (raíz)', () => {
      const resultado = validarCodigoInterno('1');
      expect(resultado.valido).toBe(true);
    });

    it('acepta código con exactamente 8 niveles (límite)', () => {
      const resultado = validarCodigoInterno('1.1.1.1.1.1.1.1');
      expect(resultado.valido).toBe(true);
    });
  });

  describe('calcularNivelDesdeCodigo', () => {
    it('calcula nivel 5 para "1.1.1.001.01"', () => {
      expect(calcularNivelDesdeCodigo('1.1.1.001.01')).toBe(5);
    });

    it('calcula nivel 1 para código raíz', () => {
      expect(calcularNivelDesdeCodigo('1')).toBe(1);
    });

    it('calcula nivel 4 para "1.1.1.001"', () => {
      expect(calcularNivelDesdeCodigo('1.1.1.001')).toBe(4);
    });
  });

  describe('naturalezaDefaultParaClase', () => {
    it.each([
      [ClaseCuenta.ACTIVO, NaturalezaCuenta.DEUDORA],
      [ClaseCuenta.EGRESO, NaturalezaCuenta.DEUDORA],
      [ClaseCuenta.PASIVO, NaturalezaCuenta.ACREEDORA],
      [ClaseCuenta.PATRIMONIO, NaturalezaCuenta.ACREEDORA],
      [ClaseCuenta.INGRESO, NaturalezaCuenta.ACREEDORA],
    ])('clase %s → naturaleza default %s', (clase, esperada) => {
      expect(naturalezaDefaultParaClase(clase)).toBe(esperada);
    });
  });

  describe('naturalezaOpuesta', () => {
    it('DEUDORA → ACREEDORA', () => {
      expect(naturalezaOpuesta(NaturalezaCuenta.DEUDORA)).toBe(NaturalezaCuenta.ACREEDORA);
    });

    it('ACREEDORA → DEUDORA', () => {
      expect(naturalezaOpuesta(NaturalezaCuenta.ACREEDORA)).toBe(NaturalezaCuenta.DEUDORA);
    });
  });

  describe('validarContrariaNaturaleza', () => {
    it('acepta cuenta contraria en ACTIVO con naturaleza ACREEDORA (ej: Depreciación Acumulada)', () => {
      const resultado = validarContrariaNaturaleza(
        ClaseCuenta.ACTIVO,
        true,
        NaturalezaCuenta.ACREEDORA,
      );
      expect(resultado.valido).toBe(true);
    });

    it('rechaza cuenta contraria en ACTIVO con naturaleza DEUDORA (default, no contraria)', () => {
      const resultado = validarContrariaNaturaleza(
        ClaseCuenta.ACTIVO,
        true,
        NaturalezaCuenta.DEUDORA,
      );
      expect(resultado).toEqual({
        valido: false,
        error: expect.objectContaining({
          code: CuentaErrorCode.CONTRARIA_NATURALEZA_INVALIDA,
        }),
      });
    });

    it('rechaza cuenta NO contraria en ACTIVO con naturaleza ACREEDORA', () => {
      const resultado = validarContrariaNaturaleza(
        ClaseCuenta.ACTIVO,
        false,
        NaturalezaCuenta.ACREEDORA,
      );
      expect(resultado.valido).toBe(false);
    });

    it('acepta cuenta normal de INGRESO con naturaleza ACREEDORA', () => {
      const resultado = validarContrariaNaturaleza(
        ClaseCuenta.INGRESO,
        false,
        NaturalezaCuenta.ACREEDORA,
      );
      expect(resultado.valido).toBe(true);
    });
  });

  describe('validarConsistenciaClaseSubclase', () => {
    it('acepta ACTIVO + ACTIVO_CORRIENTE en nivel 4', () => {
      const resultado = validarConsistenciaClaseSubclase(
        ClaseCuenta.ACTIVO,
        SubClaseCuenta.ACTIVO_CORRIENTE,
        4,
      );
      expect(resultado.valido).toBe(true);
    });

    it('rechaza ACTIVO + INGRESO_OPERATIVO (inconsistente)', () => {
      const resultado = validarConsistenciaClaseSubclase(
        ClaseCuenta.ACTIVO,
        SubClaseCuenta.INGRESO_OPERATIVO,
        4,
      );
      expect(resultado).toEqual({
        valido: false,
        error: expect.objectContaining({ code: CuentaErrorCode.SUBCLASE_INCONSISTENTE }),
      });
    });

    it('acepta EGRESO + EGRESO_COMERCIALIZACION', () => {
      const resultado = validarConsistenciaClaseSubclase(
        ClaseCuenta.EGRESO,
        SubClaseCuenta.EGRESO_COMERCIALIZACION,
        4,
      );
      expect(resultado.valido).toBe(true);
    });

    it('acepta cuenta raíz (nivel 1) sin subClase', () => {
      const resultado = validarConsistenciaClaseSubclase(ClaseCuenta.ACTIVO, null, 1);
      expect(resultado.valido).toBe(true);
    });

    it('rechaza cuenta nivel 2 sin subClase', () => {
      const resultado = validarConsistenciaClaseSubclase(ClaseCuenta.ACTIVO, null, 2);
      expect(resultado.valido).toBe(false);
    });
  });

  describe('constantes', () => {
    it('MAX_NIVELES_CODIGO_INTERNO es 8', () => {
      expect(MAX_NIVELES_CODIGO_INTERNO).toBe(8);
    });
  });
});
