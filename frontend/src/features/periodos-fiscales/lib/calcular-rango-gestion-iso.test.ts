import { describe, expect, it } from 'vitest';

import { calcularRangoGestionISO } from './calcular-rango-gestion-iso';

describe('calcularRangoGestionISO', () => {
  it('mesInicio=1 (empresa comercial) → gestión dentro del mismo año', () => {
    expect(calcularRangoGestionISO(2026, 1)).toEqual({
      fechaInicio: '2026-01-01',
      fechaFin: '2026-12-31',
    });
  });

  it('mesInicio=4 (empresa industrial) → cruza al año siguiente', () => {
    expect(calcularRangoGestionISO(2026, 4)).toEqual({
      fechaInicio: '2026-04-01',
      fechaFin: '2027-03-31',
    });
  });

  it('mesInicio=2 año 2024 → gestión feb2024 a ene2025', () => {
    expect(calcularRangoGestionISO(2024, 2)).toEqual({
      fechaInicio: '2024-02-01',
      fechaFin: '2025-01-31',
    });
  });

  it('mesInicio=3 año 2024 → termina en febrero 2025 (no bisiesto) = 28 días', () => {
    // La gestión va de mar-2024 a feb-2025. 2025 no es bisiesto → febFin = 28.
    expect(calcularRangoGestionISO(2024, 3)).toEqual({
      fechaInicio: '2024-03-01',
      fechaFin: '2025-02-28',
    });
  });

  it('mesInicio=3 año 2023 → termina en febrero 2024 (bisiesto) = 29 días', () => {
    // La gestión va de mar-2023 a feb-2024. 2024 es bisiesto → febFin = 29.
    expect(calcularRangoGestionISO(2023, 3)).toEqual({
      fechaInicio: '2023-03-01',
      fechaFin: '2024-02-29',
    });
  });

  it('mesInicio=12 → termina en noviembre del año siguiente', () => {
    expect(calcularRangoGestionISO(2026, 12)).toEqual({
      fechaInicio: '2026-12-01',
      fechaFin: '2027-11-30',
    });
  });

  it('mesInicio=7 (agropecuaria) → gestión jul2026 a jun2027', () => {
    expect(calcularRangoGestionISO(2026, 7)).toEqual({
      fechaInicio: '2026-07-01',
      fechaFin: '2027-06-30',
    });
  });

  it('mesInicio=10 (minera) → gestión oct2026 a sep2027', () => {
    expect(calcularRangoGestionISO(2026, 10)).toEqual({
      fechaInicio: '2026-10-01',
      fechaFin: '2027-09-30',
    });
  });

  it('mesInicio fuera de rango 1-12 → lanza error', () => {
    expect(() => calcularRangoGestionISO(2026, 0)).toThrow();
    expect(() => calcularRangoGestionISO(2026, 13)).toThrow();
  });
});
