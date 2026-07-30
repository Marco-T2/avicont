import { describe, expect, it } from 'vitest';

import { mensajeVentas } from './mensaje-ventas';

function errorCon(code: string, message = 'mensaje del backend'): unknown {
  return { response: { data: { error: { code, message } } } };
}

describe('mensajeVentas', () => {
  it('VENTA_CONDICION_PAGO_CON_APLICACIONES → indica desaplicar los cobros primero', () => {
    const msg = mensajeVentas(errorCon('VENTA_CONDICION_PAGO_CON_APLICACIONES'), 'x');
    expect(msg).toMatch(/desaplic/i);
    expect(msg).toMatch(/cobros/i);
  });

  it('VENTA_VENCIMIENTO_REQUERIDO → habla del vencimiento en crédito', () => {
    expect(mensajeVentas(errorCon('VENTA_VENCIMIENTO_REQUERIDO'), 'x')).toMatch(
      /vencimiento/i,
    );
  });

  it('VENTA_CUENTA_SNAPSHOT_INACTIVA → nombra la cuenta inactiva de la línea', () => {
    expect(mensajeVentas(errorCon('VENTA_CUENTA_SNAPSHOT_INACTIVA'), 'x')).toMatch(
      /inactiva/i,
    );
  });

  it('VENTA_CUENTA_DESTINO_NO_ELEGIBLE → pide una cuenta de efectivo', () => {
    expect(mensajeVentas(errorCon('VENTA_CUENTA_DESTINO_NO_ELEGIBLE'), 'x')).toMatch(
      /efectivo/i,
    );
  });

  it('VENTA_PERIODO_NO_ABIERTO → nombra la reapertura del período (§4.4)', () => {
    expect(mensajeVentas(errorCon('VENTA_PERIODO_NO_ABIERTO'), 'x')).toMatch(
      /reabrir/i,
    );
  });

  it('código desconocido → cae al message del backend', () => {
    expect(mensajeVentas(errorCon('OTRO_CODIGO', 'ya viene en español'), 'x')).toBe(
      'ya viene en español',
    );
  });

  it('sin payload de backend → cae al fallback', () => {
    expect(mensajeVentas(new Error('network'), 'No se pudo guardar')).toBe(
      'No se pudo guardar',
    );
  });
});
