import { describe, expect, it } from 'vitest';

import {
  hoyEnLaPazISO,
  primerDiaDelAnioISO,
  primerDiaDelMesISO,
  rangoMesAnteriorISO,
  ultimoDiaDelMesISO,
} from './fecha-actual';

describe('hoyEnLaPazISO', () => {
  it('devuelve la fecha en formato YYYY-MM-DD', () => {
    const clock = () => new Date('2026-06-16T12:00:00Z');
    expect(hoyEnLaPazISO(clock)).toBe('2026-06-16');
  });

  it('usa la zona horaria de La Paz (UTC-4), no UTC, cerca de la medianoche', () => {
    // 02:00 UTC del 1-ene = 22:00 del 31-dic en La Paz → el día contable es 31-dic.
    const clock = () => new Date('2026-01-01T02:00:00Z');
    expect(hoyEnLaPazISO(clock)).toBe('2025-12-31');
  });
});

describe('primerDiaDelAnioISO', () => {
  it('devuelve el 1 de enero del año en curso', () => {
    const clock = () => new Date('2026-06-16T12:00:00Z');
    expect(primerDiaDelAnioISO(clock)).toBe('2026-01-01');
  });

  it('toma el año en La Paz, no en UTC, cerca del cambio de año', () => {
    // 02:00 UTC del 1-ene-2026 = 31-dic-2025 en La Paz → el año en curso es 2025.
    const clock = () => new Date('2026-01-01T02:00:00Z');
    expect(primerDiaDelAnioISO(clock)).toBe('2025-01-01');
  });
});

describe('primerDiaDelMesISO', () => {
  it('devuelve el primer día del mes actual en La Paz', () => {
    const clock = () => new Date('2026-04-15T10:00:00Z');
    expect(primerDiaDelMesISO(clock)).toBe('2026-04-01');
  });

  it('devuelve el primer día del mes para el último día del mes', () => {
    const clock = () => new Date('2026-01-31T23:59:59Z');
    // 23:59:59 UTC del 31-ene = 19:59:59 La Paz (UTC-4) → sigue siendo enero
    expect(primerDiaDelMesISO(clock)).toBe('2026-01-01');
  });

  it('usa La Paz, no UTC, cerca de medianoche — borde 04:30 UTC = 00:30 La Paz, aún junio', () => {
    // 2026-06-01T04:30:00Z = 00:30 del 01-jun en La Paz → primer día de junio
    const clock = () => new Date('2026-06-01T04:30:00Z');
    expect(primerDiaDelMesISO(clock)).toBe('2026-06-01');
  });
});

describe('ultimoDiaDelMesISO', () => {
  it('devuelve el último día de abril (30 días)', () => {
    const clock = () => new Date('2026-04-15T10:00:00Z');
    expect(ultimoDiaDelMesISO(clock)).toBe('2026-04-30');
  });

  it('devuelve el 29 de febrero en año bisiesto', () => {
    const clock = () => new Date('2024-02-10T00:00:00Z');
    expect(ultimoDiaDelMesISO(clock)).toBe('2024-02-29');
  });

  it('devuelve el 28 de febrero en año no bisiesto', () => {
    const clock = () => new Date('2026-02-10T00:00:00Z');
    expect(ultimoDiaDelMesISO(clock)).toBe('2026-02-28');
  });

  it('devuelve el 31 de enero', () => {
    const clock = () => new Date('2026-01-15T12:00:00Z');
    expect(ultimoDiaDelMesISO(clock)).toBe('2026-01-31');
  });

  it('devuelve el 31 de diciembre', () => {
    const clock = () => new Date('2026-12-01T12:00:00Z');
    expect(ultimoDiaDelMesISO(clock)).toBe('2026-12-31');
  });
});

describe('rangoMesAnteriorISO', () => {
  it('mes de junio → rango de mayo', () => {
    const clock = () => new Date('2026-06-15T10:00:00Z');
    expect(rangoMesAnteriorISO(clock)).toEqual({
      fechaDesde: '2026-05-01',
      fechaHasta: '2026-05-31',
    });
  });

  it('mes de enero → cruza al diciembre del año anterior', () => {
    const clock = () => new Date('2026-01-15T10:00:00Z');
    expect(rangoMesAnteriorISO(clock)).toEqual({
      fechaDesde: '2025-12-01',
      fechaHasta: '2025-12-31',
    });
  });

  it('primer día del mes → rango del mes anterior completo', () => {
    // 2026-06-01T00:00:00Z = 20:00 del 31-may en La Paz → hoy es 31-may
    // La Paz está en UTC-4: 00:00 UTC = 20:00 La Paz anterior
    const clock = () => new Date('2026-06-01T00:00:00Z');
    // Las 00:00 UTC del 01-jun = 20:00 La Paz del 31-may → hoy = mayo
    // mes anterior = abril
    expect(rangoMesAnteriorISO(clock)).toEqual({
      fechaDesde: '2026-04-01',
      fechaHasta: '2026-04-30',
    });
  });

  it('borde de medianoche La Paz: 2026-05-31T23:30:00Z = 19:30 La Paz → hoy es 31-may, mes anterior = abril', () => {
    const clock = () => new Date('2026-05-31T23:30:00Z');
    // 23:30 UTC = 19:30 La Paz (UTC-4) → La Paz aún está en mayo
    expect(rangoMesAnteriorISO(clock)).toEqual({
      fechaDesde: '2026-04-01',
      fechaHasta: '2026-04-30',
    });
  });

  it('mes de marzo → rango de febrero (no bisiesto 2026)', () => {
    const clock = () => new Date('2026-03-10T12:00:00Z');
    expect(rangoMesAnteriorISO(clock)).toEqual({
      fechaDesde: '2026-02-01',
      fechaHasta: '2026-02-28',
    });
  });

  it('mes de marzo 2025 → rango de febrero 2025 (no bisiesto)', () => {
    const clock = () => new Date('2025-03-10T12:00:00Z');
    expect(rangoMesAnteriorISO(clock)).toEqual({
      fechaDesde: '2025-02-01',
      fechaHasta: '2025-02-28',
    });
  });
});
