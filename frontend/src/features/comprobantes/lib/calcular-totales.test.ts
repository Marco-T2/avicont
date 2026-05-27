import { describe, expect, it } from 'vitest';

import { calcularTotalesLineas } from './calcular-totales';

interface LineaMinima {
  debitoBob: string;
  creditoBob: string;
}

describe('calcularTotalesLineas', () => {
  it('suma correctamente debitoBob y creditoBob', () => {
    const lineas: LineaMinima[] = [
      { debitoBob: '1000.00', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '1000.00' },
    ];
    const result = calcularTotalesLineas(lineas);
    expect(result.totalDebitoBob).toBeCloseTo(1000);
    expect(result.totalCreditoBob).toBeCloseTo(1000);
  });

  it('detecta balanceado cuando la diferencia es menor a 0.01', () => {
    const lineas: LineaMinima[] = [
      { debitoBob: '1000.00', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '1000.00' },
    ];
    expect(calcularTotalesLineas(lineas).estaBalanceado).toBe(true);
  });

  it('detecta desbalanceado cuando la diferencia supera 0.01', () => {
    const lineas: LineaMinima[] = [
      { debitoBob: '1000.00', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '999.00' },
    ];
    expect(calcularTotalesLineas(lineas).estaBalanceado).toBe(false);
  });

  it('tolera diferencia de exactamente 0.01 (borde)', () => {
    const lineas: LineaMinima[] = [
      { debitoBob: '1000.01', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '1000.00' },
    ];
    expect(calcularTotalesLineas(lineas).estaBalanceado).toBe(true);
  });

  it('array vacío retorna ceros y balanceado=true', () => {
    const result = calcularTotalesLineas([]);
    expect(result.totalDebitoBob).toBe(0);
    expect(result.totalCreditoBob).toBe(0);
    expect(result.estaBalanceado).toBe(true);
  });

  it('ignora strings vacíos (los trata como 0)', () => {
    const lineas: LineaMinima[] = [
      { debitoBob: '', creditoBob: '' },
      { debitoBob: '500.00', creditoBob: '500.00' },
    ];
    const result = calcularTotalesLineas(lineas);
    expect(result.totalDebitoBob).toBeCloseTo(500);
    expect(result.totalCreditoBob).toBeCloseTo(500);
    expect(result.estaBalanceado).toBe(true);
  });

  it('múltiples líneas multi-moneda BOB', () => {
    const lineas: LineaMinima[] = [
      { debitoBob: '500.00', creditoBob: '0' },
      { debitoBob: '696.00', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '1196.00' },
    ];
    const result = calcularTotalesLineas(lineas);
    expect(result.totalDebitoBob).toBeCloseTo(1196);
    expect(result.totalCreditoBob).toBeCloseTo(1196);
    expect(result.estaBalanceado).toBe(true);
  });
});
