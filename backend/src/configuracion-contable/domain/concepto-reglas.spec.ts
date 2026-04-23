import { ClaseCuenta } from '@prisma/client';

import { CONCEPTOS, CONCEPTO_REGLAS, esConceptoValido, reglaParaConcepto } from './concepto-reglas';

describe('concepto-reglas (puro)', () => {
  describe('CONCEPTOS', () => {
    it('expone exactamente los 12 conceptos del schema', () => {
      expect(CONCEPTOS).toHaveLength(12);
    });

    it('cubre los IDs del modelo OrgConfiguracionContable', () => {
      expect(CONCEPTOS).toEqual(
        expect.arrayContaining([
          'ivaCreditoId',
          'ivaDebitoId',
          'ivaCreditoImportacionesId',
          'itPorPagarId',
          'iuePorPagarId',
          'rcIvaRetenidoId',
          'difCambioGananciaId',
          'difCambioPerdidaId',
          'resultadoEjercicioId',
          'resultadosAcumuladosId',
          'cajaChicaDefaultId',
          'ajustePorInflacionId',
        ]),
      );
    });
  });

  describe('esConceptoValido', () => {
    it('reconoce un concepto válido', () => {
      expect(esConceptoValido('ivaCreditoId')).toBe(true);
    });

    it('rechaza nombres que no son conceptos', () => {
      expect(esConceptoValido('foo')).toBe(false);
      expect(esConceptoValido('')).toBe(false);
    });
  });

  describe('CONCEPTO_REGLAS', () => {
    it.each([
      ['ivaCreditoId', ClaseCuenta.ACTIVO],
      ['ivaCreditoImportacionesId', ClaseCuenta.ACTIVO],
      ['ivaDebitoId', ClaseCuenta.PASIVO],
      ['itPorPagarId', ClaseCuenta.PASIVO],
      ['iuePorPagarId', ClaseCuenta.PASIVO],
      ['rcIvaRetenidoId', ClaseCuenta.PASIVO],
      ['difCambioGananciaId', ClaseCuenta.INGRESO],
      ['difCambioPerdidaId', ClaseCuenta.EGRESO],
      ['resultadoEjercicioId', ClaseCuenta.PATRIMONIO],
      ['resultadosAcumuladosId', ClaseCuenta.PATRIMONIO],
      ['cajaChicaDefaultId', ClaseCuenta.ACTIVO],
      ['ajustePorInflacionId', ClaseCuenta.PATRIMONIO],
    ] as const)('concepto %s → clase %s', (concepto, claseEsperada) => {
      expect(CONCEPTO_REGLAS[concepto].claseEsperada).toBe(claseEsperada);
    });

    it('cubre los 12 conceptos', () => {
      expect(Object.keys(CONCEPTO_REGLAS)).toHaveLength(12);
    });
  });

  describe('reglaParaConcepto', () => {
    it('devuelve la regla completa con descripción', () => {
      const r = reglaParaConcepto('ivaDebitoId');
      expect(r.claseEsperada).toBe(ClaseCuenta.PASIVO);
      expect(r.descripcion).toContain('IVA Débito');
    });
  });
});
