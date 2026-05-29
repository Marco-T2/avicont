import { describe, expect, it } from 'vitest';

import { buildFormSchema } from './documento-fisico-form-schema';

const VALID_BASE = {
  tipoDocumentoFisicoId: '123e4567-e89b-12d3-a456-426614174000',
  numero: 'F-001',
  fechaEmision: '2026-05-01',
};

describe('buildFormSchema — modo tributario (esTributario=true)', () => {
  it('tributario sin monto → error en monto', () => {
    const schema = buildFormSchema(true);
    const result = schema.safeParse({ ...VALID_BASE, monto: null, moneda: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('monto');
    }
  });

  it('tributario con monto cero → error en monto (regex rechaza cero)', () => {
    const schema = buildFormSchema(true);
    const result = schema.safeParse({ ...VALID_BASE, monto: '0.00', moneda: 'BOB' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('monto');
    }
  });

  it('tributario con monto y moneda válidos → ok', () => {
    const schema = buildFormSchema(true);
    const result = schema.safeParse({ ...VALID_BASE, monto: '1250.50', moneda: 'BOB' });
    expect(result.success).toBe(true);
  });

  it('tributario sin moneda → error en moneda', () => {
    const schema = buildFormSchema(true);
    const result = schema.safeParse({ ...VALID_BASE, monto: '100.00', moneda: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('moneda');
    }
  });
});

describe('buildFormSchema — modo no tributario (esTributario=false)', () => {
  it('no-tributario sin monto → ok (monto no requerido)', () => {
    const schema = buildFormSchema(false);
    const result = schema.safeParse({ ...VALID_BASE });
    expect(result.success).toBe(true);
  });

  it('número con espacio → error regex (no acepta espacios)', () => {
    const schema = buildFormSchema(false);
    const result = schema.safeParse({ ...VALID_BASE, numero: 'fac 0042' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('numero');
    }
  });

  it('número uppercase con guión → ok', () => {
    const schema = buildFormSchema(false);
    const result = schema.safeParse({ ...VALID_BASE, numero: 'FAC-0042' });
    expect(result.success).toBe(true);
  });

  it('número con minúsculas → error regex', () => {
    const schema = buildFormSchema(false);
    const result = schema.safeParse({ ...VALID_BASE, numero: 'fac-001' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('numero');
    }
  });
});
