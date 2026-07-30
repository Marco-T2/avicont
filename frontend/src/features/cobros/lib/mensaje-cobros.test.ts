import { describe, expect, it } from 'vitest';

import { mensajeCobros } from './mensaje-cobros';

function errorConCode(code: string, details?: Record<string, unknown>, message?: string): unknown {
  return {
    response: {
      data: {
        error: { code, message: message ?? 'mensaje del backend', ...(details ? { details } : {}) },
      },
    },
  };
}

describe('mensajeCobros', () => {
  it('COBRO_MONTO_INFERIOR_APLICADO incluye cuánto desaplicar y aclara que el sistema no elige', () => {
    const msg = mensajeCobros(
      errorConCode('COBRO_MONTO_INFERIOR_APLICADO', { montoADesaplicarBob: '300.00' }),
      'fallback',
    );
    expect(msg).toContain('Desaplicá Bs 300.00 primero');
    expect(msg).toContain('no elige');
  });

  it('COBRO_MONTO_INFERIOR_APLICADO sin details sigue pidiendo desaplicar', () => {
    const msg = mensajeCobros(errorConCode('COBRO_MONTO_INFERIOR_APLICADO'), 'fallback');
    expect(msg).toContain('Desaplicá primero');
  });

  it('COBRO_CUENTA_DESTINO_NO_ELEGIBLE explica el criterio de efectivo', () => {
    const msg = mensajeCobros(errorConCode('COBRO_CUENTA_DESTINO_NO_ELEGIBLE'), 'fallback');
    expect(msg).toContain('efectivo');
    expect(msg).toContain('1.1.1');
  });

  it('APLICACION_EXCEDE_COBRO interpola el disponible', () => {
    const msg = mensajeCobros(
      errorConCode('APLICACION_EXCEDE_COBRO', { disponibleBob: '100.00' }),
      'fallback',
    );
    expect(msg).toContain('Bs 100.00 disponibles');
  });

  it('APLICACION_EXCEDE_VENTA interpola lo que queda por cobrar', () => {
    const msg = mensajeCobros(
      errorConCode('APLICACION_EXCEDE_VENTA', { disponibleBob: '250.00' }),
      'fallback',
    );
    expect(msg).toContain('Bs 250.00 por cobrar');
  });

  it('COBRO_PERIODO_NO_ABIERTO nombra la reapertura formal como único camino', () => {
    const msg = mensajeCobros(errorConCode('COBRO_PERIODO_NO_ABIERTO'), 'fallback');
    expect(msg).toContain('reabrir el período');
  });

  it('APLICACION_VENTA_CONTADO explica que la venta al contado no admite aplicaciones', () => {
    const msg = mensajeCobros(errorConCode('APLICACION_VENTA_CONTADO'), 'fallback');
    expect(msg).toContain('contado');
  });

  it('APLICACION_CONTACTO_DISTINTO tiene mensaje propio', () => {
    const msg = mensajeCobros(errorConCode('APLICACION_CONTACTO_DISTINTO'), 'fallback');
    expect(msg).toContain('clientes distintos');
  });

  it('code desconocido cae al message del backend', () => {
    const msg = mensajeCobros(errorConCode('OTRO_CODE', undefined, 'mensaje en español'), 'fallback');
    expect(msg).toBe('mensaje en español');
  });

  it('sin payload reconocible cae al fallback', () => {
    expect(mensajeCobros(new Error('network'), 'No se pudo registrar el cobro')).toBe(
      'No se pudo registrar el cobro',
    );
  });
});
