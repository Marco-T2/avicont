/**
 * Tests unitarios de ResumenLote.calcular — el corazón del read-model de granja.
 * Sin DB, sin NestJS. Puro.
 *
 * Cubre spec granja-costo-pollo §Requirements completo:
 *   - Cálculo con inversiones y mortalidad (costoPorPolloVivo correcto)
 *   - La mortalidad encarece cada sobreviviente
 *   - Lote sin inversiones → costoPorPolloVivo = Bs 0.00
 *   - Mortalidad total (avesVivas = 0) → costoPorPolloVivo = null (no divide por cero)
 *   - porcentajeMortalidad correcto
 */

import { Money } from '@/common/domain/money';

import { ResumenLote, type ResumenLoteInput } from './resumen-lote';

// ============================================================
// Helpers
// ============================================================

function calcular(
  overrides: Partial<ResumenLoteInput> & { loteId: string; cantidadInicial: number },
): ResumenLote {
  const input: ResumenLoteInput = {
    totalMuertes: 0,
    costoAcumulado: Money.ZERO,
    ...overrides,
  };
  return ResumenLote.calcular(input);
}

// ============================================================
// Tests
// ============================================================

describe('ResumenLote.calcular', () => {
  describe('lote sin movimientos', () => {
    it('lote recién creado: avesVivas = cantidadInicial, costo = 0.00, costoPorPolloVivo = 0.00', () => {
      const resumen = calcular({ loteId: 'lote-1', cantidadInicial: 3000 });

      expect(resumen.avesVivas).toBe(3000);
      expect(resumen.costoAcumulado.toBob()).toBe('0.00');
      // costo = 0, avesVivas > 0 → costoPorPolloVivo = 0.00
      expect(resumen.costoPorPolloVivo).not.toBeNull();
      expect(resumen.costoPorPolloVivo!.toBob()).toBe('0.00');
      expect(resumen.porcentajeMortalidad).toBe(0);
    });
  });

  describe('lote con inversiones y mortalidad', () => {
    it('75000 / 4900 = Bs 15.31 (redondeo half-up a 2 decimales)', () => {
      const resumen = calcular({
        loteId: 'lote-1',
        cantidadInicial: 5000,
        totalMuertes: 100,
        costoAcumulado: Money.of('75000'),
      });

      expect(resumen.avesVivas).toBe(4900);
      expect(resumen.costoAcumulado.toBob()).toBe('75000.00');
      expect(resumen.costoPorPolloVivo).not.toBeNull();
      expect(resumen.costoPorPolloVivo!.toBob()).toBe('15.31');
    });

    it('la mortalidad encarece cada sobreviviente: 75000 / 4500 = Bs 16.67', () => {
      const resumen = calcular({
        loteId: 'lote-1',
        cantidadInicial: 5000,
        totalMuertes: 500,
        costoAcumulado: Money.of('75000'),
      });

      expect(resumen.avesVivas).toBe(4500);
      expect(resumen.costoPorPolloVivo!.toBob()).toBe('16.67');
    });

    it('sin mortalidad: 75000 / 5000 = Bs 15.00', () => {
      const resumen = calcular({
        loteId: 'lote-1',
        cantidadInicial: 5000,
        totalMuertes: 0,
        costoAcumulado: Money.of('75000'),
      });

      expect(resumen.avesVivas).toBe(5000);
      expect(resumen.costoPorPolloVivo!.toBob()).toBe('15.00');
    });
  });

  describe('mortalidad total (avesVivas = 0)', () => {
    it('costoPorPolloVivo = null (no divide por cero)', () => {
      const resumen = calcular({
        loteId: 'lote-1',
        cantidadInicial: 5000,
        totalMuertes: 5000,
        costoAcumulado: Money.of('30000'),
      });

      expect(resumen.avesVivas).toBe(0);
      expect(resumen.costoAcumulado.toBob()).toBe('30000.00');
      expect(resumen.costoPorPolloVivo).toBeNull();
    });

    it('porcentajeMortalidad = 1.0 (100%) en mortalidad total', () => {
      const resumen = calcular({
        loteId: 'lote-1',
        cantidadInicial: 5000,
        totalMuertes: 5000,
      });

      expect(resumen.porcentajeMortalidad).toBe(1.0);
    });
  });

  describe('porcentajeMortalidad', () => {
    it('calcula correctamente el porcentaje (100 / 5000 = 0.02)', () => {
      const resumen = calcular({
        loteId: 'lote-1',
        cantidadInicial: 5000,
        totalMuertes: 100,
      });

      expect(resumen.porcentajeMortalidad).toBeCloseTo(0.02);
    });

    it('0% si no hay muertes', () => {
      const resumen = calcular({
        loteId: 'lote-1',
        cantidadInicial: 3000,
        totalMuertes: 0,
      });

      expect(resumen.porcentajeMortalidad).toBe(0);
    });
  });

  describe('avesVivas siempre >= 0', () => {
    it('avesVivas = cantidadInicial - totalMuertes, nunca negativo', () => {
      // El service garantiza avesVivas >= 0 con FOR UPDATE
      // Este test verifica la fórmula
      const resumen = calcular({
        loteId: 'lote-1',
        cantidadInicial: 100,
        totalMuertes: 100,
      });

      expect(resumen.avesVivas).toBe(0);
      expect(resumen.avesVivas).toBeGreaterThanOrEqual(0);
    });
  });

  describe('loteId propagado correctamente', () => {
    it('retiene el loteId en el resumen', () => {
      const resumen = calcular({ loteId: 'lote-abc-123', cantidadInicial: 1000 });
      expect(resumen.loteId).toBe('lote-abc-123');
    });
  });
});
