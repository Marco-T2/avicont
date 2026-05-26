import { describe, expect, it } from 'vitest';

import { nuevaGestionSchema } from './nueva-gestion-schema';

const currentYear = new Date().getFullYear();

describe('nuevaGestionSchema', () => {
  it('acepta el año actual', () => {
    const r = nuevaGestionSchema.safeParse({ year: currentYear });
    expect(r.success).toBe(true);
  });

  it('acepta el año siguiente (borde superior)', () => {
    const r = nuevaGestionSchema.safeParse({ year: currentYear + 1 });
    expect(r.success).toBe(true);
  });

  it('acepta 2000 (borde inferior)', () => {
    const r = nuevaGestionSchema.safeParse({ year: 2000 });
    expect(r.success).toBe(true);
  });

  it('rechaza 1999 con mensaje claro', () => {
    const r = nuevaGestionSchema.safeParse({ year: 1999 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/2000/);
    }
  });

  it('rechaza currentYear + 2 con mensaje sobre el año siguiente', () => {
    const r = nuevaGestionSchema.safeParse({ year: currentYear + 2 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/año/i);
    }
  });

  it('rechaza string no numérico', () => {
    const r = nuevaGestionSchema.safeParse({ year: 'abc' });
    expect(r.success).toBe(false);
  });

  it('rechaza decimales', () => {
    const r = nuevaGestionSchema.safeParse({ year: 2026.5 });
    expect(r.success).toBe(false);
  });
});
