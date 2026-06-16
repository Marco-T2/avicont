import { describe, expect, it } from 'vitest';

import { flujoEfectivoFiltroSchema } from './flujo-efectivo-filtro-schema';

describe('flujo-efectivo-filtro-schema', () => {
  it('acepta modo período con periodoFiscalId válido', () => {
    const res = flujoEfectivoFiltroSchema.safeParse({
      modo: 'periodo',
      periodoFiscalId: 'p1',
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.incluirAnulados).toBe(false);
  });

  it('acepta modo rango con desde <= hasta', () => {
    const res = flujoEfectivoFiltroSchema.safeParse({
      modo: 'rango',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-12-31',
      incluirAnulados: true,
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.incluirAnulados).toBe(true);
  });

  it('rechaza modo rango cuando desde > hasta con mensaje en español', () => {
    const res = flujoEfectivoFiltroSchema.safeParse({
      modo: 'rango',
      fechaDesde: '2026-12-31',
      fechaHasta: '2026-01-01',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msg = res.error.issues[0]?.message ?? '';
      // Mensaje debe estar en español
      expect(msg).toMatch(/fecha/i);
    }
  });

  it('arranca con incluirAnulados en false por default', () => {
    const res = flujoEfectivoFiltroSchema.safeParse({
      modo: 'rango',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-12-31',
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.incluirAnulados).toBe(false);
  });
});
