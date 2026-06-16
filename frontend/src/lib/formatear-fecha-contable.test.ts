import { describe, expect, it } from 'vitest';

import { formatearFechaContable } from './formatear-fecha-contable';

describe('formatearFechaContable — helper compartido (src/lib)', () => {
  it('convierte YYYY-MM-DD al formato dd/MM/yyyy', () => {
    expect(formatearFechaContable('2026-05-01')).toBe('01/05/2026');
  });

  it('convierte una fecha de julio correctamente', () => {
    expect(formatearFechaContable('2026-07-15')).toBe('15/07/2026');
  });

  it('mantiene el día correcto sin corrimiento UTC en fin de año', () => {
    expect(formatearFechaContable('2025-12-31')).toBe('31/12/2025');
  });

  it('mantiene el día correcto sin corrimiento UTC en inicio de año', () => {
    expect(formatearFechaContable('2026-01-01')).toBe('01/01/2026');
  });

  it('rellena con cero los días y meses de un dígito', () => {
    expect(formatearFechaContable('2026-05-03')).toBe('03/05/2026');
  });
});
