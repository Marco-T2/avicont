import { describe, expect, it } from 'vitest';

import { hojaTrabajoFiltroSchema } from './hoja-trabajo-filtro-schema';

describe('hojaTrabajoFiltroSchema', () => {
  describe('modo período', () => {
    it('acepta un período fiscal válido y aplica el default de incluirAnulados', () => {
      const result = hojaTrabajoFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'p1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.incluirAnulados).toBe(false);
      }
    });

    it('rechaza período vacío', () => {
      const result = hojaTrabajoFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('modo rango', () => {
    it('acepta un rango con fechaDesde ≤ fechaHasta', () => {
      const result = hojaTrabajoFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-04-01',
        fechaHasta: '2026-04-30',
        incluirAnulados: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.incluirAnulados).toBe(true);
      }
    });

    it('rechaza fechas con formato inválido', () => {
      const result = hojaTrabajoFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '01/04/2026',
        fechaHasta: '2026-04-30',
      });
      expect(result.success).toBe(false);
    });

    it('rechaza fechaDesde posterior a fechaHasta', () => {
      const result = hojaTrabajoFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-04-30',
        fechaHasta: '2026-04-01',
      });
      expect(result.success).toBe(false);
    });
  });

  it('rechaza un modo desconocido', () => {
    const result = hojaTrabajoFiltroSchema.safeParse({
      modo: 'otro',
      periodoFiscalId: 'p1',
    });
    expect(result.success).toBe(false);
  });
});
