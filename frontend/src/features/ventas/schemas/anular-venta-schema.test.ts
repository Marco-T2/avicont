import { describe, expect, it } from 'vitest';

import { anularVentaSchema } from './anular-venta-schema';

describe('anularVentaSchema', () => {
  it('acepta un motivo con 10+ caracteres significativos', () => {
    expect(
      anularVentaSchema.safeParse({ motivo: 'Venta duplicada por error' }).success,
    ).toBe(true);
  });

  it('rechaza menos de 10 caracteres', () => {
    expect(anularVentaSchema.safeParse({ motivo: 'corto' }).success).toBe(false);
  });

  it('rechaza 10+ caracteres de puro espacio — el trim los reduce a nada (§4.7)', () => {
    expect(
      anularVentaSchema.safeParse({ motivo: '            ' }).success,
    ).toBe(false);
  });

  it('trimea el motivo antes de enviarlo', () => {
    const result = anularVentaSchema.safeParse({
      motivo: '  Venta duplicada por error  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.motivo).toBe('Venta duplicada por error');
    }
  });
});
