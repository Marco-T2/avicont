import { describe, expect, it } from 'vitest';

import { registerSchema } from './register-schema';

describe('registerSchema', () => {
  const base = {
    email: 'a@b.bo',
    password: '12345678',
    organizationName: 'Mi Asociación',
  };

  it('acepta los tres módulos válidos', () => {
    for (const modulo of ['CONTABILIDAD', 'GRANJA', 'OTROS'] as const) {
      expect(registerSchema.safeParse({ ...base, modulo }).success).toBe(true);
    }
  });

  it('rechaza un módulo fuera del catálogo', () => {
    expect(
      registerSchema.safeParse({ ...base, modulo: 'INVENTARIO' }).success,
    ).toBe(false);
  });

  it('exige el módulo: no valida el alta sin él', () => {
    expect(registerSchema.safeParse(base).success).toBe(false);
  });
});
