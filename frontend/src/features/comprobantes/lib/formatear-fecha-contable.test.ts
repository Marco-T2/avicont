import { describe, expect, it } from 'vitest';

import { formatearFechaContable } from './formatear-fecha-contable';

describe('formatearFechaContable', () => {
  it('convierte ISO YYYY-MM-DD a dd/MM/yyyy', () => {
    // '2026-04-22' debe verse como "22/04/2026"
    const result = formatearFechaContable('2026-04-22');
    expect(result).toBe('22/04/2026');
  });

  it('maneja inicio de año', () => {
    expect(formatearFechaContable('2026-01-01')).toBe('01/01/2026');
  });

  it('maneja fin de año', () => {
    expect(formatearFechaContable('2025-12-31')).toBe('31/12/2025');
  });

  it('rellena con cero en día y mes de 1 dígito', () => {
    expect(formatearFechaContable('2026-05-03')).toBe('03/05/2026');
  });

  it('retorna la fecha en formato legible (no ISO)', () => {
    const result = formatearFechaContable('2026-07-15');
    expect(result).not.toContain('-');
    expect(result).toContain('/');
  });
});
