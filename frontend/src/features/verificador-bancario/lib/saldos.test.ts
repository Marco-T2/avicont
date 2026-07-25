import { describe, expect, it } from 'vitest';

import {
  DIAS_TOLERANCIA_SALDO,
  diasDeAtrasoDelSaldo,
  estaSaldoDesactualizado,
} from './saldos';

// La aritmética de saldos (suma por moneda, null ≠ 0) vive en el BACKEND
// (`saldosPorMoneda`, con Money/decimal.js) — acá solo queda la lógica de
// presentación: comparación de fechas calendario.
//
// El `hoy` se inyecta SIEMPRE: un test que dependa del reloj real cambia de
// resultado mañana.
const HOY = '2026-07-25';

describe('diasDeAtrasoDelSaldo (REQ-VMB-10)', () => {
  it('el corte se acota a hoy: un rango que termina en el futuro no exige movimientos que no ocurrieron', () => {
    // hasta=31/07 es futuro respecto de HOY=25/07 → el corte efectivo es HOY.
    // Movimiento del 23/07 → 2 días, no los 8 que daría comparar contra 31/07.
    expect(diasDeAtrasoDelSaldo('2026-07-23', '2026-07-31', HOY)).toBe(2);
  });

  it('rango histórico: el corte es `hasta`, no hoy', () => {
    expect(diasDeAtrasoDelSaldo('2026-05-01', '2026-05-31', HOY)).toBe(30);
  });

  it('movimiento en el corte → vigente', () => {
    expect(diasDeAtrasoDelSaldo('2026-05-31', '2026-05-31', HOY)).toBe(0);
  });

  it('movimiento POSTERIOR al corte → 0, nunca negativo', () => {
    expect(diasDeAtrasoDelSaldo('2026-07-20', '2026-05-31', HOY)).toBe(0);
  });

  it('sin movimientos → 0 (tiene su propio indicador)', () => {
    expect(diasDeAtrasoDelSaldo(null, '2026-07-31', HOY)).toBe(0);
  });

  it('cruce de año se cuenta como calendario, no como resta de strings', () => {
    expect(diasDeAtrasoDelSaldo('2025-12-31', '2026-01-10', '2026-01-10')).toBe(10);
  });

  it('cruce de febrero bisiesto: 2028 tiene 29 días', () => {
    // 2028 es bisiesto (÷4, no ÷100). 28/02 → 01/03 son 2 días, no 1.
    expect(diasDeAtrasoDelSaldo('2028-02-28', '2028-03-01', '2028-03-01')).toBe(2);
  });

  it('febrero NO bisiesto: 2026 tiene 28 días', () => {
    expect(diasDeAtrasoDelSaldo('2026-02-28', '2026-03-01', '2026-03-01')).toBe(1);
  });
});

describe('estaSaldoDesactualizado (REQ-VMB-10)', () => {
  it('atraso mayor a la tolerancia → desactualizado', () => {
    expect(estaSaldoDesactualizado('2026-05-01', '2026-07-31', HOY)).toBe(true);
  });

  it('atraso dentro de la tolerancia → vigente (una cuenta pasa días sin movimiento)', () => {
    // 21/07 contra HOY=25/07 → 4 días. La versión vieja lo marcaba, y marcaba
    // TODAS las cuentas: es el bug que este cambio corrige.
    expect(estaSaldoDesactualizado('2026-07-21', '2026-07-31', HOY)).toBe(false);
  });

  it('exactamente en el límite de la tolerancia → todavía vigente', () => {
    expect(diasDeAtrasoDelSaldo('2026-07-18', '2026-07-31', HOY)).toBe(DIAS_TOLERANCIA_SALDO);
    expect(estaSaldoDesactualizado('2026-07-18', '2026-07-31', HOY)).toBe(false);
  });

  it('un día más allá del límite → desactualizado', () => {
    expect(diasDeAtrasoDelSaldo('2026-07-17', '2026-07-31', HOY)).toBe(
      DIAS_TOLERANCIA_SALDO + 1,
    );
    expect(estaSaldoDesactualizado('2026-07-17', '2026-07-31', HOY)).toBe(true);
  });

  it('sin fecha (cuenta sin movimientos) → no marca desactualización', () => {
    expect(estaSaldoDesactualizado(null, '2026-06-30', HOY)).toBe(false);
  });

  it('las 3 cuentas del caso real: solo la genuinamente atrasada se marca', () => {
    // Regresión del bug: con hasta=31/07 y HOY=25/07 la lógica vieja
    // (fechaUltimoMovimiento < hasta) marcaba las TRES.
    const hasta = '2026-07-31';
    expect(estaSaldoDesactualizado('2026-07-21', hasta, HOY)).toBe(false); // BANCO SOL1
    expect(estaSaldoDesactualizado('2026-05-01', hasta, HOY)).toBe(true); //  BMSC
    expect(estaSaldoDesactualizado('2026-07-23', hasta, HOY)).toBe(false); // ECONOMICO
  });
});
