import { describe, expect, it } from 'vitest';

import { derivarEstadoCierre } from './derivar-estado-cierre';

describe('derivarEstadoCierre', () => {
  it('devuelve SIN_CIERRES cuando no hay cierres', () => {
    expect(derivarEstadoCierre([])).toBe('SIN_CIERRES');
  });

  it('devuelve EN_BORRADOR cuando todos están en BORRADOR', () => {
    const cierres = [{ estado: 'BORRADOR' as const }, { estado: 'BORRADOR' as const }];
    expect(derivarEstadoCierre(cierres)).toBe('EN_BORRADOR');
  });

  it('devuelve PARCIALMENTE_CONTABILIZADO cuando hay mezcla de estados', () => {
    const cierres = [
      { estado: 'CONTABILIZADO' as const },
      { estado: 'BORRADOR' as const },
    ];
    expect(derivarEstadoCierre(cierres)).toBe('PARCIALMENTE_CONTABILIZADO');
  });

  it('devuelve TODOS_CONTABILIZADO cuando todos están contabilizados', () => {
    const cierres = [
      { estado: 'CONTABILIZADO' as const },
      { estado: 'CONTABILIZADO' as const },
    ];
    expect(derivarEstadoCierre(cierres)).toBe('TODOS_CONTABILIZADO');
  });

  it('devuelve TODOS_CONTABILIZADO con un solo elemento CONTABILIZADO (caso SKIP-on-zero)', () => {
    expect(derivarEstadoCierre([{ estado: 'CONTABILIZADO' as const }])).toBe('TODOS_CONTABILIZADO');
  });
});
