import { describe, expect, it } from 'vitest';

import { estadoResultadosFiltroSchema } from './estado-resultados-filtro-schema';

describe('estadoResultadosFiltroSchema', () => {
  it('acepta un rango YYYY-MM-DD válido con incluirAnulados', () => {
    const result = estadoResultadosFiltroSchema.safeParse({
      fechaDesde: '2026-05-01',
      fechaHasta: '2026-05-31',
      incluirAnulados: false,
    });
    expect(result.success).toBe(true);
  });

  it('acepta un rango de un solo día (desde === hasta)', () => {
    const result = estadoResultadosFiltroSchema.safeParse({
      fechaDesde: '2026-05-31',
      fechaHasta: '2026-05-31',
      incluirAnulados: false,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza una fecha con formato inválido', () => {
    const result = estadoResultadosFiltroSchema.safeParse({
      fechaDesde: '01/05/2026',
      fechaHasta: '2026-05-31',
      incluirAnulados: false,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza fechaDesde vacía', () => {
    const result = estadoResultadosFiltroSchema.safeParse({
      fechaDesde: '',
      fechaHasta: '2026-05-31',
      incluirAnulados: true,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza un rango invertido (desde posterior a hasta)', () => {
    const result = estadoResultadosFiltroSchema.safeParse({
      fechaDesde: '2026-05-31',
      fechaHasta: '2026-05-01',
      incluirAnulados: false,
    });
    expect(result.success).toBe(false);
  });

  it('exige incluirAnulados booleano', () => {
    const result = estadoResultadosFiltroSchema.safeParse({
      fechaDesde: '2026-05-01',
      fechaHasta: '2026-05-31',
    });
    expect(result.success).toBe(false);
  });
});
