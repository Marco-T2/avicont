import { describe, expect, it } from 'vitest';

import { estaBalanceado, calcularDiffBob } from './partida-doble';

describe('estaBalanceado', () => {
  it('retorna true cuando débito === crédito exacto', () => {
    expect(estaBalanceado(1000, 1000)).toBe(true);
  });

  it('retorna true con diferencia de 0.01 (tolerancia exacta)', () => {
    expect(estaBalanceado(1000.01, 1000.00)).toBe(true);
  });

  it('retorna false cuando diferencia supera 0.01', () => {
    expect(estaBalanceado(1000.02, 1000.00)).toBe(false);
  });

  it('retorna true con ceros (vacío balanceado)', () => {
    expect(estaBalanceado(0, 0)).toBe(true);
  });

  it('retorna false con diferencia negativa > tolerancia', () => {
    expect(estaBalanceado(999.00, 1000.00)).toBe(false);
  });

  it('maneja floats imprecisos dentro de tolerancia', () => {
    // 0.1 + 0.2 = 0.30000000000000004 en IEEE-754
    // La diferencia con 0.3 es 4e-17, bien dentro de 0.01
    expect(estaBalanceado(0.1 + 0.2, 0.3)).toBe(true);
  });
});

describe('calcularDiffBob', () => {
  it('retorna la diferencia absoluta redondeada a 2 decimales', () => {
    expect(calcularDiffBob(1000.50, 1000.00)).toBe('0.50');
  });

  it('retorna "0.00" cuando están balanceados', () => {
    expect(calcularDiffBob(1000, 1000)).toBe('0.00');
  });

  it('maneja diferencia negativa (crédito > débito)', () => {
    expect(calcularDiffBob(900, 1000)).toBe('100.00');
  });

  it('redondea a 2 decimales (formato consistente)', () => {
    // 1000.25 - 1000 = 0.25 exacto → "0.25"
    expect(calcularDiffBob(1000.25, 1000)).toBe('0.25');
  });
});
