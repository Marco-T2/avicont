import { describe, expect, it } from 'vitest';

import { buildVentasParams, PAGE_SIZE } from './build-ventas-params';

describe('buildVentasParams', () => {
  it('omite los filtros vacíos', () => {
    expect(buildVentasParams(null, '', '', 1)).toEqual({
      page: 1,
      pageSize: PAGE_SIZE,
    });
  });

  it('incluye contacto y rango cuando están seteados', () => {
    expect(
      buildVentasParams('contacto-1', '2026-07-01', '2026-07-31', 2),
    ).toEqual({
      contactoId: 'contacto-1',
      fechaDesde: '2026-07-01',
      fechaHasta: '2026-07-31',
      page: 2,
      pageSize: PAGE_SIZE,
    });
  });
});
