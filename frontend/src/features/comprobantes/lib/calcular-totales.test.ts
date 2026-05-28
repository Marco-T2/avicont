import { describe, expect, it } from 'vitest';

import { calcularTotalesLineas } from './calcular-totales';

interface LineaMinima {
  debito: string;
  credito: string;
  tipoCambio: string;
}

describe('calcularTotalesLineas', () => {
  it('suma correctamente débitos y créditos en BOB (TC=1)', () => {
    const lineas: LineaMinima[] = [
      { debito: '1000.00', credito: '0', tipoCambio: '1' },
      { debito: '0', credito: '1000.00', tipoCambio: '1' },
    ];
    const result = calcularTotalesLineas(lineas);
    expect(result.totalDebitoBob).toBeCloseTo(1000);
    expect(result.totalCreditoBob).toBeCloseTo(1000);
  });

  it('detecta balanceado cuando la diferencia es menor a 0.01', () => {
    const lineas: LineaMinima[] = [
      { debito: '1000.00', credito: '0', tipoCambio: '1' },
      { debito: '0', credito: '1000.00', tipoCambio: '1' },
    ];
    expect(calcularTotalesLineas(lineas).estaBalanceado).toBe(true);
  });

  it('detecta desbalanceado cuando la diferencia supera 0.01', () => {
    const lineas: LineaMinima[] = [
      { debito: '1000.00', credito: '0', tipoCambio: '1' },
      { debito: '0', credito: '999.00', tipoCambio: '1' },
    ];
    expect(calcularTotalesLineas(lineas).estaBalanceado).toBe(false);
  });

  it('tolera diferencia de exactamente 0.01 (borde)', () => {
    const lineas: LineaMinima[] = [
      { debito: '1000.01', credito: '0', tipoCambio: '1' },
      { debito: '0', credito: '1000.00', tipoCambio: '1' },
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
      { debito: '', credito: '', tipoCambio: '1' },
      { debito: '500.00', credito: '500.00', tipoCambio: '1' },
    ];
    const result = calcularTotalesLineas(lineas);
    expect(result.totalDebitoBob).toBeCloseTo(500);
    expect(result.totalCreditoBob).toBeCloseTo(500);
    expect(result.estaBalanceado).toBe(true);
  });

  it('múltiples líneas multi-moneda BOB', () => {
    const lineas: LineaMinima[] = [
      { debito: '500.00', credito: '0', tipoCambio: '1' },
      { debito: '696.00', credito: '0', tipoCambio: '1' },
      { debito: '0', credito: '1196.00', tipoCambio: '1' },
    ];
    const result = calcularTotalesLineas(lineas);
    expect(result.totalDebitoBob).toBeCloseTo(1196);
    expect(result.totalCreditoBob).toBeCloseTo(1196);
    expect(result.estaBalanceado).toBe(true);
  });

  it('aplica tipoCambio para líneas en USD', () => {
    // 100 USD × 7 = 700 BOB (débito) vs 700 BOB crédito → balanceado
    const lineas: LineaMinima[] = [
      { debito: '100.00', credito: '0', tipoCambio: '7.00' },
      { debito: '0', credito: '700.00', tipoCambio: '1' },
    ];
    const result = calcularTotalesLineas(lineas);
    expect(result.totalDebitoBob).toBeCloseTo(700);
    expect(result.totalCreditoBob).toBeCloseTo(700);
    expect(result.estaBalanceado).toBe(true);
  });
});
