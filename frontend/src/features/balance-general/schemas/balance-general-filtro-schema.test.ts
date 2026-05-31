import { describe, expect, it } from 'vitest';

import { balanceGeneralFiltroSchema } from './balance-general-filtro-schema';

describe('balanceGeneralFiltroSchema', () => {
  it('acepta una fecha YYYY-MM-DD válida con incluirAnulados', () => {
    const result = balanceGeneralFiltroSchema.safeParse({
      fecha: '2026-05-31',
      incluirAnulados: false,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza una fecha con formato inválido', () => {
    const result = balanceGeneralFiltroSchema.safeParse({
      fecha: '31/05/2026',
      incluirAnulados: false,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza fecha vacía', () => {
    const result = balanceGeneralFiltroSchema.safeParse({
      fecha: '',
      incluirAnulados: true,
    });
    expect(result.success).toBe(false);
  });

  it('exige incluirAnulados booleano', () => {
    const result = balanceGeneralFiltroSchema.safeParse({ fecha: '2026-05-31' });
    expect(result.success).toBe(false);
  });
});
