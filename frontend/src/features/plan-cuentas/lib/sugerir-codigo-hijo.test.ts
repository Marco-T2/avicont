import { describe, expect, it } from 'vitest';

import { sugerirCodigoHijo } from './sugerir-codigo-hijo';

describe('sugerirCodigoHijo', () => {
  const padre = { codigoInterno: '1.1.1' };

  it('si el padre no tiene hijas, sugiere .001', () => {
    expect(sugerirCodigoHijo(padre, [])).toBe('1.1.1.001');
  });

  it('con hijas consecutivas 001, 002, 003, sugiere 004', () => {
    expect(
      sugerirCodigoHijo(padre, [
        { codigoInterno: '1.1.1.001' },
        { codigoInterno: '1.1.1.002' },
        { codigoInterno: '1.1.1.003' },
      ]),
    ).toBe('1.1.1.004');
  });

  it('con huecos intencionales (001, 002, 005), sugiere 006 — NO rellena 003', () => {
    expect(
      sugerirCodigoHijo(padre, [
        { codigoInterno: '1.1.1.001' },
        { codigoInterno: '1.1.1.002' },
        { codigoInterno: '1.1.1.005' },
      ]),
    ).toBe('1.1.1.006');
  });

  it('incluye cuentas inactivas en el cálculo del máximo (no reusa códigos desactivados)', () => {
    expect(
      sugerirCodigoHijo(padre, [
        { codigoInterno: '1.1.1.001' },
        { codigoInterno: '1.1.1.002' },
        // 1.1.1.003 podría estar desactivada, pero aquí se pasa igual
        { codigoInterno: '1.1.1.003' },
      ]),
    ).toBe('1.1.1.004');
  });

  it('ignora nietos (segmentos con punto adentro del sufijo)', () => {
    expect(
      sugerirCodigoHijo(padre, [
        { codigoInterno: '1.1.1.001' },
        { codigoInterno: '1.1.1.001.05' }, // nieta — no cuenta
        { codigoInterno: '1.1.1.002' },
      ]),
    ).toBe('1.1.1.003');
  });

  it('preserva el padding del segmento mayor (001 → 002, no 2)', () => {
    expect(
      sugerirCodigoHijo(padre, [{ codigoInterno: '1.1.1.099' }]),
    ).toBe('1.1.1.100');
  });

  it('si el máximo tiene padding menor, usa el padding mayor encontrado', () => {
    // Mix de padding: 01, 100 → max padding = 3
    expect(
      sugerirCodigoHijo(padre, [
        { codigoInterno: '1.1.1.01' },
        { codigoInterno: '1.1.1.100' },
      ]),
    ).toBe('1.1.1.101');
  });

  it('con un solo hijo no numérico, lo ignora y arranca desde .001', () => {
    expect(
      sugerirCodigoHijo(padre, [{ codigoInterno: '1.1.1.X01' }]),
    ).toBe('1.1.1.001');
  });
});
