import { describe, expect, it } from 'vitest';

import { labelOrigenCierre } from './labels-origen-cierre';

describe('labelOrigenCierre', () => {
  it('mapea CIERRE_GASTOS al label correcto', () => {
    expect(labelOrigenCierre('CIERRE_GASTOS')).toBe('Cierre de gastos y costos');
  });

  it('mapea CIERRE_INGRESOS al label correcto', () => {
    expect(labelOrigenCierre('CIERRE_INGRESOS')).toBe('Cierre de ingresos');
  });

  it('mapea CIERRE_RESULTADO al label correcto', () => {
    expect(labelOrigenCierre('CIERRE_RESULTADO')).toBe('Traslado del resultado');
  });

  it('fallback para valor desconocido: devuelve el string original, nunca lanza', () => {
    expect(() => labelOrigenCierre('CIERRE_DESCONOCIDO')).not.toThrow();
    expect(labelOrigenCierre('CIERRE_DESCONOCIDO')).toBe('CIERRE_DESCONOCIDO');
  });
});
