import { describe, expect, it } from 'vitest';

import { editarComprobanteSchema } from './editar-comprobante-schema';

const lineaDebito = {
  cuentaId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  moneda: 'BOB' as const,
  debito: '1000.00',
  credito: '0',
  tipoCambio: '1',
};

const lineaCredito = {
  cuentaId: '4fa85f64-5717-4562-b3fc-2c963f66afa7',
  moneda: 'BOB' as const,
  debito: '0',
  credito: '1000.00',
  tipoCambio: '1',
};

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

  describe('superRefine — validación de partida doble', () => {
    it('es válido cuando lineas no está definido (PATCH parcial sin líneas)', () => {
      const r = editarComprobanteSchema.safeParse({ glosa: 'Solo glosa' });
      expect(r.success).toBe(true);
    });

    it('es válido cuando lineas está balanceado (≥2 líneas, ΣDeb===ΣCred)', () => {
      const r = editarComprobanteSchema.safeParse({
        lineas: [lineaDebito, lineaCredito],
      });
      expect(r.success).toBe(true);
    });

    it('falla cuando lineas está desbalanceado en más de Bs 0.01', () => {
      const creditoDesbalanceado = { ...lineaCredito, credito: '999.00' };
      const r = editarComprobanteSchema.safeParse({
        lineas: [lineaDebito, creditoDesbalanceado],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const msgs = r.error.issues.map((i) => i.message).join(' ');
        expect(msgs).toMatch(/débitos no igualan a los créditos/i);
      }
    });

    it('es válido cuando lineas tiene solo 1 línea (borrador con línea única)', () => {
      const r = editarComprobanteSchema.safeParse({ lineas: [lineaDebito] });
      expect(r.success).toBe(true);
    });

    it('es válido cuando la diferencia es exactamente 0.01 (en el límite de tolerancia)', () => {
      const creditoConTolerancia = { ...lineaCredito, credito: '1000.01' };
      const r = editarComprobanteSchema.safeParse({
        lineas: [lineaDebito, creditoConTolerancia],
      });
      expect(r.success).toBe(true);
    });
  });
});
