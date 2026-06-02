import { describe, expect, it } from 'vitest';

import { createOrgSchema } from './create-org-schema';

describe('createOrgSchema', () => {
  const valido = {
    name: 'Asociación Avícola Cochabamba',
    modulo: 'CONTABILIDAD' as const,
    ownerEmail: 'owner@example.com',
  };

  it('acepta un payload válido', () => {
    const result = createOrgSchema.safeParse(valido);
    expect(result.success).toBe(true);
  });

  it('rechaza nombre vacío con mensaje en español', () => {
    const result = createOrgSchema.safeParse({ ...valido, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('El nombre es obligatorio');
    }
  });

  it('rechaza nombre de más de 100 caracteres', () => {
    const result = createOrgSchema.safeParse({ ...valido, name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Máximo 100 caracteres');
    }
  });

  it('rechaza un email con formato inválido', () => {
    const result = createOrgSchema.safeParse({ ...valido, ownerEmail: 'no-es-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Formato de email inválido');
    }
  });

  it('rechaza un módulo fuera del enum', () => {
    const result = createOrgSchema.safeParse({ ...valido, modulo: 'INVALIDO' });
    expect(result.success).toBe(false);
  });

  it('acepta los tres módulos válidos', () => {
    for (const modulo of ['CONTABILIDAD', 'GRANJA', 'OTROS'] as const) {
      expect(createOrgSchema.safeParse({ ...valido, modulo }).success).toBe(true);
    }
  });
});
