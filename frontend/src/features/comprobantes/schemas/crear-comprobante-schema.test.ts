import { describe, expect, it } from 'vitest';

import { crearComprobanteSchema } from './crear-comprobante-schema';

const lineaDebito = {
  cuentaId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  moneda: 'BOB' as const,
  debito: '1000.00',
  credito: '0',
  tipoCambio: '1',
  debitoBob: '1000.00',
  creditoBob: '0',
};

const lineaCredito = {
  cuentaId: '4fa85f64-5717-4562-b3fc-2c963f66afa7',
  moneda: 'BOB' as const,
  debito: '0',
  credito: '1000.00',
  tipoCambio: '1',
  debitoBob: '0',
  creditoBob: '1000.00',
};

const cabeceraValida = {
  tipo: 'DIARIO' as const,
  fechaContable: '2026-04-22',
  glosa: 'Venta al contado',
  monedaPrincipal: 'BOB' as const,
  lineas: [lineaDebito, lineaCredito],
};

describe('crearComprobanteSchema', () => {
  it('acepta comprobante balanceado con 2 líneas', () => {
    expect(crearComprobanteSchema.safeParse(cabeceraValida).success).toBe(true);
  });

  it('acepta sin monedaPrincipal (opcional)', () => {
    const { monedaPrincipal: _, ...sin } = cabeceraValida;
    expect(crearComprobanteSchema.safeParse(sin).success).toBe(true);
  });

  it('rechaza glosa vacía', () => {
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, glosa: '' });
    expect(r.success).toBe(false);
  });

  it('rechaza glosa mayor a 500 caracteres', () => {
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, glosa: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('rechaza tipo inválido', () => {
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, tipo: 'INVALIDO' });
    expect(r.success).toBe(false);
  });

  it('rechaza fechaContable con formato incorrecto', () => {
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, fechaContable: '22/04/2026' });
    expect(r.success).toBe(false);
  });

  it('rechaza lineas vacías', () => {
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, lineas: [] });
    expect(r.success).toBe(false);
  });

  it('rechaza cuando los totales BOB están desbalanceados (superRefine)', () => {
    const lineaDesequilibrada = { ...lineaCredito, creditoBob: '999.00', credito: '999.00' };
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, lineas: [lineaDebito, lineaDesequilibrada] });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message).join(' ');
      expect(msgs.toLowerCase()).toMatch(/balanc|débito|debito|crédito|credito/i);
    }
  });

  it('acepta comprobante con diferencia <= 0.01 BOB (tolerancia)', () => {
    const lineaConDiff = { ...lineaCredito, creditoBob: '1000.01', credito: '1000.01' };
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, lineas: [lineaDebito, lineaConDiff] });
    expect(r.success).toBe(true);
  });

  it('acepta tipo INGRESO', () => {
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, tipo: 'INGRESO' });
    expect(r.success).toBe(true);
  });

  it('acepta tipo EGRESO', () => {
    const r = crearComprobanteSchema.safeParse({ ...cabeceraValida, tipo: 'EGRESO' });
    expect(r.success).toBe(true);
  });
});
