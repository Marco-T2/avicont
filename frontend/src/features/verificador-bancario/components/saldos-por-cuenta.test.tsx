import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SaldoCuentaBancaria } from '@/types/api';

import { SaldosPorCuenta } from './saldos-por-cuenta';

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

describe('SaldosPorCuenta — franja de saldos vigentes (REQ-VMB-08/09/10)', () => {
  it('muestra por cuenta el saldo del banco con su fecha de último movimiento', () => {
    render(
      <SaldosPorCuenta
        saldos={[
          saldo({
            cuentaBancariaId: 'a',
            alias: 'BancoSol operativa',
            saldo: '1500.00',
            fechaUltimoMovimiento: '2026-06-30',
          }),
        ]}
        hasta="2026-06-30"
      />,
    );

    const card = screen.getByText('BancoSol operativa').closest('li');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('1.500,00')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/30\/06\/2026/)).toBeInTheDocument();
  });

  it('marca DESACTUALIZADO cuando fechaUltimoMovimiento < hasta, y no cuando está al día', () => {
    render(
      <SaldosPorCuenta
        saldos={[
          saldo({
            cuentaBancariaId: 'vieja',
            alias: 'Cuenta vieja',
            saldo: '900.00',
            fechaUltimoMovimiento: '2026-06-10',
          }),
          saldo({
            cuentaBancariaId: 'aldia',
            alias: 'Cuenta al día',
            saldo: '100.00',
            fechaUltimoMovimiento: '2026-06-30',
          }),
        ]}
        hasta="2026-06-30"
      />,
    );

    const vieja = screen.getByText('Cuenta vieja').closest('li') as HTMLElement;
    const alDia = screen.getByText('Cuenta al día').closest('li') as HTMLElement;

    expect(within(vieja).getByText(/desactualizado/i)).toBeInTheDocument();
    expect(within(alDia).queryByText(/desactualizado/i)).not.toBeInTheDocument();
  });

  it('cuenta con saldo null se excluye de la suma con indicador visible — nunca cuenta como 0', () => {
    render(
      <SaldosPorCuenta
        saldos={[
          saldo({
            cuentaBancariaId: 'a',
            alias: 'Con saldo A',
            saldo: '1500.00',
            fechaUltimoMovimiento: '2026-06-30',
          }),
          saldo({
            cuentaBancariaId: 'b',
            alias: 'Con saldo B',
            saldo: '250.50',
            fechaUltimoMovimiento: '2026-06-30',
          }),
          saldo({
            cuentaBancariaId: 'c',
            alias: 'Cuenta FIE',
            saldo: null,
            fechaUltimoMovimiento: '2026-06-20',
          }),
        ]}
        hasta="2026-06-30"
      />,
    );

    // Suma BOB = solo las dos primeras (1750.50), la tercera excluida.
    expect(screen.getByText('1.750,50')).toBeInTheDocument();
    // Indicador en la cuenta excluida.
    const sinSaldo = screen.getByText('Cuenta FIE').closest('li') as HTMLElement;
    expect(within(sinSaldo).getByText(/sin saldo/i)).toBeInTheDocument();
    // Nota de exclusión en el subtotal.
    expect(screen.getByText(/1 cuenta sin saldo excluida/i)).toBeInTheDocument();
  });

  it('subtotales por moneda separados — sin total combinado entre monedas', () => {
    render(
      <SaldosPorCuenta
        saldos={[
          saldo({
            cuentaBancariaId: 'a',
            alias: 'BOB 1',
            saldo: '1000.00',
            fechaUltimoMovimiento: '2026-06-30',
          }),
          saldo({
            cuentaBancariaId: 'b',
            alias: 'USD 1',
            moneda: 'USD',
            saldo: '200.00',
            fechaUltimoMovimiento: '2026-06-30',
          }),
        ]}
        hasta="2026-06-30"
      />,
    );

    expect(screen.getByText(/total bob/i)).toBeInTheDocument();
    expect(screen.getByText(/total usd/i)).toBeInTheDocument();
    // 1000 + 200 jamás se combinan (monedas distintas).
    expect(screen.queryByText('1.200,00')).not.toBeInTheDocument();
  });

  it('cuenta sin movimientos (null/null) aparece igual, con su indicador', () => {
    render(
      <SaldosPorCuenta
        saldos={[saldo({ cuentaBancariaId: 'n', alias: 'Cuenta nueva' })]}
        hasta="2026-06-30"
      />,
    );

    const card = screen.getByText('Cuenta nueva').closest('li') as HTMLElement;
    expect(within(card).getByText(/sin movimientos/i)).toBeInTheDocument();
  });
});
