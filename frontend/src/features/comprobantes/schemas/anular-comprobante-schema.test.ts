import { describe, expect, it } from 'vitest';

import { anularComprobanteSchema } from './anular-comprobante-schema';

describe('anularComprobanteSchema', () => {
  it('acepta motivo con exactamente 10 caracteres significativos', () => {
    const r = anularComprobanteSchema.safeParse({ motivo: '1234567890' });
    expect(r.success).toBe(true);
  });

  it('acepta motivo con más de 10 caracteres significativos', () => {
    const r = anularComprobanteSchema.safeParse({ motivo: 'Error en la imputación contable' });
    expect(r.success).toBe(true);
  });

  it('rechaza motivo con menos de 10 caracteres (ej. "corto")', () => {
    const r = anularComprobanteSchema.safeParse({ motivo: 'corto' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message).join(' ');
      expect(msgs).toMatch(/10/);
    }
  });

  it('rechaza motivo con solo 10 espacios (whitespace no cuenta)', () => {
    // trim() hace que 10 espacios → "" de longitud 0 → falla min(10)
    const r = anularComprobanteSchema.safeParse({ motivo: '          ' });
    expect(r.success).toBe(false);
  });

  it('rechaza motivo con 9 chars significativos rodeados de espacios', () => {
    // "  123456789  " → trim → "123456789" (9 chars) → falla
    const r = anularComprobanteSchema.safeParse({ motivo: '  123456789  ' });
    expect(r.success).toBe(false);
  });

  it('acepta motivo con 10 chars significativos rodeados de espacios', () => {
    // "  1234567890  " → trim → "1234567890" (10 chars) → OK
    const r = anularComprobanteSchema.safeParse({ motivo: '  1234567890  ' });
    expect(r.success).toBe(true);
  });

  it('el valor parseado tiene los espacios recortados', () => {
    const r = anularComprobanteSchema.safeParse({ motivo: '  motivo valido aqui  ' });
    if (r.success) {
      expect(r.data.motivo).toBe('motivo valido aqui');
    } else {
      throw new Error('debería ser válido');
    }
  });

  it('rechaza string vacío', () => {
    const r = anularComprobanteSchema.safeParse({ motivo: '' });
    expect(r.success).toBe(false);
  });

  it('rechaza motivo ausente', () => {
    const r = anularComprobanteSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
