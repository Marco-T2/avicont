import { describe, expect, it } from 'vitest';

import { estaSaldoDesactualizado } from './saldos';

// La aritmética de saldos (suma por moneda, null ≠ 0) vive en el BACKEND
// (`saldosPorMoneda`, con Money/decimal.js) — acá solo queda la lógica de
// presentación: comparación de fechas calendario.

describe('estaSaldoDesactualizado (REQ-VMB-10)', () => {
  it('fecha anterior al corte → desactualizado', () => {
    expect(estaSaldoDesactualizado('2026-06-10', '2026-06-30')).toBe(true);
  });

  it('fecha igual al corte → vigente', () => {
    expect(estaSaldoDesactualizado('2026-06-30', '2026-06-30')).toBe(false);
  });

  it('sin fecha (cuenta sin movimientos) → no marca desactualización (tiene su propio indicador)', () => {
    expect(estaSaldoDesactualizado(null, '2026-06-30')).toBe(false);
  });

  it('cruce de mes/año se compara como calendario, no como string parcial', () => {
    // '2025-12-31' < '2026-01-01' — el formato YYYY-MM-DD lo garantiza.
    expect(estaSaldoDesactualizado('2025-12-31', '2026-01-01')).toBe(true);
  });
});
