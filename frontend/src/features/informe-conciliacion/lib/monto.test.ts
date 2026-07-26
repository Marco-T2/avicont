import { describe, expect, it } from 'vitest';

import { esMontoCero } from './monto';

describe('esMontoCero (montos string §4.5, solo para decidir presentación)', () => {
  it('reconoce el cero con decimales', () => {
    expect(esMontoCero('0.00')).toBe(true);
  });

  it('reconoce el cero sin decimales', () => {
    expect(esMontoCero('0')).toBe(true);
  });

  it('un residuo de un centavo NO es cero — jamás se redondea a cero', () => {
    expect(esMontoCero('-0.01')).toBe(false);
    expect(esMontoCero('0.01')).toBe(false);
  });

  it('un monto no numérico no se trata como cero', () => {
    expect(esMontoCero('n/a')).toBe(false);
  });
});
