import { describe, expect, it } from 'vitest';

import { estimarFechaSaca } from './estimar-fecha-saca';

describe('estimarFechaSaca', () => {
  it('suma los días de engorde a la fecha de ingreso', () => {
    // 45 días desde el 1 de junio → 16 de julio (junio tiene 30 días).
    expect(estimarFechaSaca('2026-06-01', 45)).toBe('2026-07-16');
  });

  it('cruza el cambio de año correctamente', () => {
    expect(estimarFechaSaca('2026-12-01', 45)).toBe('2027-01-15');
  });

  it('con 0 días devuelve la misma fecha de ingreso', () => {
    expect(estimarFechaSaca('2026-06-01', 0)).toBe('2026-06-01');
  });

  it('no se desplaza por zona horaria (calendario puro)', () => {
    // Si calculáramos en hora local con offset, sumar días podría caer un día
    // antes/después. El cálculo en UTC mantiene el día de calendario exacto.
    expect(estimarFechaSaca('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('devuelve cadena vacía con fecha de ingreso inválida', () => {
    expect(estimarFechaSaca('', 45)).toBe('');
    expect(estimarFechaSaca('no-es-fecha', 45)).toBe('');
  });

  it('devuelve cadena vacía si los días no son un número válido', () => {
    expect(estimarFechaSaca('2026-06-01', Number.NaN)).toBe('');
  });
});
