import { describe, expect, it } from 'vitest';

import { reabrirPeriodoSchema } from './reabrir-periodo-schema';

describe('reabrirPeriodoSchema', () => {
  it('acepta motivo de 20 caracteres', () => {
    const r = reabrirPeriodoSchema.safeParse({ motivo: 'a'.repeat(20) });
    expect(r.success).toBe(true);
  });

  it('acepta motivo razonable de auditoría', () => {
    const r = reabrirPeriodoSchema.safeParse({
      motivo: 'Corrección de asiento mal contabilizado en auditoría',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza motivo de 19 caracteres con mensaje claro', () => {
    const r = reabrirPeriodoSchema.safeParse({ motivo: 'a'.repeat(19) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/Mínimo 20 caracteres/);
    }
  });

  it('rechaza string vacío', () => {
    const r = reabrirPeriodoSchema.safeParse({ motivo: '' });
    expect(r.success).toBe(false);
  });

  it('trim antes de validar: solo espacios falla aunque sean 30', () => {
    const r = reabrirPeriodoSchema.safeParse({ motivo: ' '.repeat(30) });
    expect(r.success).toBe(false);
  });

  it('rechaza tipo distinto a string', () => {
    const r = reabrirPeriodoSchema.safeParse({ motivo: 123 });
    expect(r.success).toBe(false);
  });
});
