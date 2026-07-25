import { describe, expect, it } from 'vitest';

import type { SaldoCuentaBancaria } from '@/types/api';

import { estaSaldoDesactualizado, resumirSaldosPorMoneda, sumarMontos } from './saldos';

function saldo(overrides: Partial<SaldoCuentaBancaria>): SaldoCuentaBancaria {
  return {
    cuentaBancariaId: 'cb-1',
    alias: 'Cuenta',
    moneda: 'BOB',
    saldo: null,
    fechaUltimoMovimiento: null,
    ...overrides,
  };
}

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

describe('sumarMontos (§4.5 — sin drift IEEE-754)', () => {
  it('suma montos de 2 decimales', () => {
    expect(sumarMontos(['1500.00', '250.50'])).toBe('1750.50');
  });

  it('0.10 + 0.20 = 0.30 exacto (un parseFloat naive daría 0.30000000000000004)', () => {
    expect(sumarMontos(['0.10', '0.20'])).toBe('0.30');
  });

  it('normaliza montos sin decimales o con 1 decimal a 2 decimales', () => {
    expect(sumarMontos(['1000', '0.5'])).toBe('1000.50');
  });

  it('un solo monto vuelve normalizado', () => {
    expect(sumarMontos(['99.9'])).toBe('99.90');
  });
});

describe('resumirSaldosPorMoneda (REQ-VMB-10)', () => {
  it('suma solo cuentas de la MISMA moneda, en subtotales separados', () => {
    const resumen = resumirSaldosPorMoneda([
      saldo({ cuentaBancariaId: 'a', saldo: '1500.00', fechaUltimoMovimiento: '2026-06-10' }),
      saldo({ cuentaBancariaId: 'b', saldo: '250.50', fechaUltimoMovimiento: '2026-06-30' }),
      saldo({
        cuentaBancariaId: 'c',
        moneda: 'USD',
        saldo: '100.00',
        fechaUltimoMovimiento: '2026-06-30',
      }),
    ]);

    expect(resumen).toEqual([
      { moneda: 'BOB', suma: '1750.50', cuentasSumadas: 2, cuentasSinSaldo: 0 },
      { moneda: 'USD', suma: '100.00', cuentasSumadas: 1, cuentasSinSaldo: 0 },
    ]);
  });

  it('cuenta con saldo null se EXCLUYE de la suma (nunca cuenta como 0) y se contabiliza aparte', () => {
    const resumen = resumirSaldosPorMoneda([
      saldo({ cuentaBancariaId: 'a', saldo: '1500.00', fechaUltimoMovimiento: '2026-06-10' }),
      saldo({ cuentaBancariaId: 'b', saldo: null, fechaUltimoMovimiento: '2026-06-20' }),
    ]);

    expect(resumen).toEqual([
      { moneda: 'BOB', suma: '1500.00', cuentasSumadas: 1, cuentasSinSaldo: 1 },
    ]);
  });

  it('todas las cuentas de una moneda sin saldo → suma null, no "0.00"', () => {
    const resumen = resumirSaldosPorMoneda([
      saldo({ cuentaBancariaId: 'a', saldo: null }),
      saldo({ cuentaBancariaId: 'b', saldo: null }),
    ]);

    expect(resumen).toEqual([{ moneda: 'BOB', suma: null, cuentasSumadas: 0, cuentasSinSaldo: 2 }]);
  });

  it('sin cuentas → sin subtotales', () => {
    expect(resumirSaldosPorMoneda([])).toEqual([]);
  });
});
