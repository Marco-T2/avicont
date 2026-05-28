import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { estaBalanceado, calcularDiffBob, superRefinePartidaDoble, TOLERANCIA_BOB } from './partida-doble';

/**
 * Ejecuta superRefinePartidaDoble contra un array de líneas
 * y retorna los issues de Zod resultantes.
 */
function runRefine(lineas: Array<{ debitoBob: string; creditoBob: string }>) {
  const issues: z.ZodIssue[] = [];
  const ctx: z.RefinementCtx = {
    addIssue: (issue) => issues.push(issue as z.ZodIssue),
    path: [],
  };
  superRefinePartidaDoble(lineas, ctx);
  return issues;
}

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

describe('TOLERANCIA_BOB', () => {
  it('es 0.01', () => {
    expect(TOLERANCIA_BOB).toBe(0.01);
  });
});

describe('superRefinePartidaDoble', () => {
  it('no agrega issues cuando el array está vacío', () => {
    expect(runRefine([])).toHaveLength(0);
  });

  it('no agrega issues cuando hay solo 1 línea (borrador con línea única)', () => {
    expect(runRefine([{ debitoBob: '500.00', creditoBob: '0' }])).toHaveLength(0);
  });

  it('no agrega issues cuando las líneas están balanceadas exactamente', () => {
    const lineas = [
      { debitoBob: '1000.00', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '1000.00' },
    ];
    expect(runRefine(lineas)).toHaveLength(0);
  });

  it('no agrega issues cuando la diferencia es exactamente 0.01 (en el límite de tolerancia)', () => {
    const lineas = [
      { debitoBob: '1000.00', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '1000.01' },
    ];
    expect(runRefine(lineas)).toHaveLength(0);
  });

  it('agrega un issue cuando la diferencia supera 0.01', () => {
    const lineas = [
      { debitoBob: '1000.00', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '999.00' },
    ];
    const issues = runRefine(lineas);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/débitos no igualan a los créditos/i);
    expect(issues[0]?.message).toContain('Bs 1.00');
  });

  it('el issue incluye path: ["lineas"]', () => {
    const lineas = [
      { debitoBob: '500.00', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '200.00' },
    ];
    const issues = runRefine(lineas);
    expect(issues[0]?.path).toEqual(['lineas']);
  });

  it('trata valores no numéricos como 0 sin lanzar error', () => {
    const lineas = [
      { debitoBob: 'NaN', creditoBob: '0' },
      { debitoBob: '0', creditoBob: '' },
    ];
    // Ambos se tratan como 0 → diff 0 → balanceado
    expect(runRefine(lineas)).toHaveLength(0);
  });
});
