import { describe, expect, it } from 'vitest';

import { evolucionPatrimonioFiltroSchema } from './evolucion-patrimonio-filtro-schema';

describe('evolucionPatrimonioFiltroSchema', () => {
  it('acepta modo período con periodoFiscalId', () => {
    const res = evolucionPatrimonioFiltroSchema.safeParse({
      modo: 'periodo',
      periodoFiscalId: 'p1',
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.incluirAnulados).toBe(false);
  });

  it('rechaza modo período sin periodoFiscalId', () => {
    const res = evolucionPatrimonioFiltroSchema.safeParse({ modo: 'periodo', periodoFiscalId: '' });
    expect(res.success).toBe(false);
  });

  it('acepta modo rango con fechaDesde ≤ fechaHasta', () => {
    const res = evolucionPatrimonioFiltroSchema.safeParse({
      modo: 'rango',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-12-31',
      incluirAnulados: true,
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.incluirAnulados).toBe(true);
  });

  it('rechaza modo rango con fechaDesde > fechaHasta', () => {
    const res = evolucionPatrimonioFiltroSchema.safeParse({
      modo: 'rango',
      fechaDesde: '2026-12-31',
      fechaHasta: '2026-01-01',
    });
    expect(res.success).toBe(false);
  });

  it('rechaza fecha con formato inválido', () => {
    const res = evolucionPatrimonioFiltroSchema.safeParse({
      modo: 'rango',
      fechaDesde: '01/01/2026',
      fechaHasta: '2026-12-31',
    });
    expect(res.success).toBe(false);
  });
});
