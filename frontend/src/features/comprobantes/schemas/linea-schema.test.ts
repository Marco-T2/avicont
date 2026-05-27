import { describe, expect, it } from 'vitest';

import { lineaSchema } from './linea-schema';

const lineaValidaBob = {
  cuentaId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  moneda: 'BOB' as const,
  debito: '1000.00',
  credito: '0',
  tipoCambio: '1',
  debitoBob: '1000.00',
  creditoBob: '0',
};

const lineaValidaUsd = {
  cuentaId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  moneda: 'USD' as const,
  debito: '100.00',
  credito: '0',
  tipoCambio: '6.96',
  debitoBob: '696.00',
  creditoBob: '0',
};

describe('lineaSchema', () => {
  it('acepta línea válida en BOB (solo débito)', () => {
    expect(lineaSchema.safeParse(lineaValidaBob).success).toBe(true);
  });

  it('acepta línea válida en BOB (solo crédito)', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaBob, debito: '0', credito: '1000.00', creditoBob: '1000.00', debitoBob: '0' });
    expect(r.success).toBe(true);
  });

  it('acepta línea válida en USD', () => {
    expect(lineaSchema.safeParse(lineaValidaUsd).success).toBe(true);
  });

  it('rechaza cuando ambos débito Y crédito son > 0 (ambigua)', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaBob, debito: '500.00', credito: '500.00', creditoBob: '500.00' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message).join(' ');
      expect(msgs.toLowerCase()).toMatch(/débito|debito|crédito|credito/i);
    }
  });

  it('rechaza cuando ambos débito Y crédito son 0 (sin monto)', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaBob, debito: '0', credito: '0', debitoBob: '0', creditoBob: '0' });
    expect(r.success).toBe(false);
  });

  it('rechaza tipoCambio = 0', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaUsd, tipoCambio: '0' });
    expect(r.success).toBe(false);
  });

  it('rechaza moneda BOB con tipoCambio distinto de "1"', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaBob, tipoCambio: '6.96' });
    expect(r.success).toBe(false);
  });

  it('acepta moneda BOB con tipoCambio "1"', () => {
    expect(lineaSchema.safeParse(lineaValidaBob).success).toBe(true);
  });

  it('rechaza moneda inválida', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaBob, moneda: 'EUR' });
    expect(r.success).toBe(false);
  });

  it('rechaza cuentaId no-UUID', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaBob, cuentaId: 'no-es-uuid' });
    expect(r.success).toBe(false);
  });

  it('rechaza valores negativos en débito', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaBob, debito: '-100' });
    expect(r.success).toBe(false);
  });

  it('acepta glosaLinea opcional ausente', () => {
    const r = lineaSchema.safeParse(lineaValidaBob);
    expect(r.success).toBe(true);
  });

  it('acepta glosaLinea presente con valor válido', () => {
    const r = lineaSchema.safeParse({ ...lineaValidaBob, glosaLinea: 'Línea de pago' });
    expect(r.success).toBe(true);
  });
});
