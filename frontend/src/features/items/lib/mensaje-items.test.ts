import { describe, expect, it } from 'vitest';

import { mensajeItems } from './mensaje-items';

// Arma un error con la forma que produce el GlobalExceptionFilter del backend
// (envuelto bajo `error` — ver @/lib/error-messages).
function errorBackend(code: string, details?: Record<string, unknown>): unknown {
  return { response: { data: { error: { code, message: 'mensaje backend', details } } } };
}

const FALLBACK = 'No se pudo guardar el ítem';

describe('mensajeItems', () => {
  it('ITEM_CODIGO_DUPLICADO con details.codigo → mensaje con el código en conflicto', () => {
    const msg = mensajeItems(errorBackend('ITEM_CODIGO_DUPLICADO', { codigo: 'P-01' }), FALLBACK);
    expect(msg).toContain('P-01');
    expect(msg).toContain('Ya existe');
  });

  it('ITEM_CODIGO_DUPLICADO sin details → mensaje genérico de duplicado', () => {
    const msg = mensajeItems(errorBackend('ITEM_CODIGO_DUPLICADO'), FALLBACK);
    expect(msg).toContain('Ya existe');
  });

  it('ITEM_CUENTA_INGRESO_INVALIDA motivo NO_ENCONTRADA', () => {
    const msg = mensajeItems(
      errorBackend('ITEM_CUENTA_INGRESO_INVALIDA', { motivo: 'NO_ENCONTRADA' }),
      FALLBACK,
    );
    expect(msg).toContain('no existe');
  });

  it('ITEM_CUENTA_INGRESO_INVALIDA motivo NO_ES_DETALLE', () => {
    const msg = mensajeItems(
      errorBackend('ITEM_CUENTA_INGRESO_INVALIDA', { motivo: 'NO_ES_DETALLE' }),
      FALLBACK,
    );
    expect(msg).toContain('detalle');
  });

  it('ITEM_CUENTA_INGRESO_INVALIDA motivo INACTIVA', () => {
    const msg = mensajeItems(
      errorBackend('ITEM_CUENTA_INGRESO_INVALIDA', { motivo: 'INACTIVA' }),
      FALLBACK,
    );
    expect(msg).toContain('inactiva');
  });

  it('ITEM_NO_ENCONTRADO → mensaje propio', () => {
    const msg = mensajeItems(errorBackend('ITEM_NO_ENCONTRADO'), FALLBACK);
    expect(msg).toContain('no existe');
  });

  it('código desconocido → message del backend', () => {
    const msg = mensajeItems(errorBackend('OTRO_CODE'), FALLBACK);
    expect(msg).toBe('mensaje backend');
  });

  it('error sin forma de backend → fallback', () => {
    expect(mensajeItems(new Error('boom'), FALLBACK)).toBe(FALLBACK);
  });
});
