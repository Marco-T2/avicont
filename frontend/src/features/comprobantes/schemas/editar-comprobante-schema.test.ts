import { describe, expect, it } from 'vitest';

import { editarComprobanteSchema } from './editar-comprobante-schema';

describe('editarComprobanteSchema', () => {
  it('acepta objeto completamente vacío (todos los campos son opcionales)', () => {
    const r = editarComprobanteSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('acepta solo glosa', () => {
    const r = editarComprobanteSchema.safeParse({ glosa: 'Nueva glosa' });
    expect(r.success).toBe(true);
  });

  it('rechaza glosa vacía cuando se provee', () => {
    const r = editarComprobanteSchema.safeParse({ glosa: '' });
    expect(r.success).toBe(false);
  });

  it('rechaza glosa mayor a 500 caracteres', () => {
    const r = editarComprobanteSchema.safeParse({ glosa: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('acepta motivo opcional de 3 a 500 chars', () => {
    const r = editarComprobanteSchema.safeParse({ motivo: 'Corrección' });
    expect(r.success).toBe(true);
  });

  it('rechaza motivo con menos de 3 caracteres', () => {
    const r = editarComprobanteSchema.safeParse({ motivo: 'ab' });
    expect(r.success).toBe(false);
  });

  it('rechaza motivo mayor a 500 caracteres', () => {
    const r = editarComprobanteSchema.safeParse({ motivo: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('acepta tipo válido', () => {
    const r = editarComprobanteSchema.safeParse({ tipo: 'INGRESO' });
    expect(r.success).toBe(true);
  });

  it('rechaza tipo inválido', () => {
    const r = editarComprobanteSchema.safeParse({ tipo: 'INVALIDO' });
    expect(r.success).toBe(false);
  });

  it('acepta fechaContable en formato YYYY-MM-DD', () => {
    const r = editarComprobanteSchema.safeParse({ fechaContable: '2026-05-01' });
    expect(r.success).toBe(true);
  });

  it('rechaza fechaContable con formato incorrecto', () => {
    const r = editarComprobanteSchema.safeParse({ fechaContable: '01/05/2026' });
    expect(r.success).toBe(false);
  });

  it('acepta lineas array', () => {
    const linea = {
      cuentaId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      moneda: 'BOB' as const,
      debito: '1000.00',
      credito: '0',
      tipoCambio: '1',
      debitoBob: '1000.00',
      creditoBob: '0',
    };
    const r = editarComprobanteSchema.safeParse({ lineas: [linea] });
    expect(r.success).toBe(true);
  });

  it('acepta combinación de campos', () => {
    const r = editarComprobanteSchema.safeParse({
      glosa: 'Glosa actualizada',
      motivo: 'Corrección menor',
    });
    expect(r.success).toBe(true);
  });
});
