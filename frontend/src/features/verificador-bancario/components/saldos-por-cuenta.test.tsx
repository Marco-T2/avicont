import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ResumenSaldosMoneda, SaldoCuentaBancaria, TotalMoneda } from '@/types/api';

import { SaldosPorCuenta } from './saldos-por-cuenta';

function total(overrides: Partial<TotalMoneda>): TotalMoneda {
  return {
    moneda: 'BOB',
    totalDebitos: '0.00',
    totalCreditos: '0.00',
    cantidad: 0,
    ...overrides,
  };
}

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

function resumen(overrides: Partial<ResumenSaldosMoneda>): ResumenSaldosMoneda {
  return {
    moneda: 'BOB',
    suma: null,
    cuentasSumadas: 0,
    cuentasSinSaldo: 0,
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
        resumen={[resumen({ suma: '1500.00', cuentasSumadas: 1 })]}
        totales={[]}
        hasta="2026-06-30"
      />,
    );

    const card = screen.getByText('BancoSol operativa').closest('li');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('1.500,00')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/30\/06\/2026/)).toBeInTheDocument();
  });

  it('marca DESACTUALIZADO con la magnitud del atraso, y no marca la cuenta al día', () => {
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
        resumen={[resumen({ suma: '1000.00', cuentasSumadas: 2 })]}
        totales={[]}
        hasta="2026-06-30"
      />,
    );

    const vieja = screen.getByText('Cuenta vieja').closest('li') as HTMLElement;
    const alDia = screen.getByText('Cuenta al día').closest('li') as HTMLElement;

    // 10/06 → 30/06 son 20 días: pasa la tolerancia y la magnitud se muestra.
    expect(within(vieja).getByText(/desactualizado/i)).toHaveTextContent('20 días');
    expect(within(alDia).queryByText(/desactualizado/i)).not.toBeInTheDocument();
  });

  it('un atraso DENTRO de la tolerancia no se marca: una cuenta pasa días sin movimiento', () => {
    // Antes se marcaba cualquier cuenta cuyo último movimiento no cayera exacto
    // en el corte, así que las marcaba TODAS y la señal no informaba nada.
    render(
      <SaldosPorCuenta
        saldos={[
          saldo({
            cuentaBancariaId: 'reciente',
            alias: 'Movimiento anteayer',
            saldo: '900.00',
            fechaUltimoMovimiento: '2026-06-28',
          }),
        ]}
        resumen={[resumen({ suma: '900.00', cuentasSumadas: 1 })]}
        totales={[]}
        hasta="2026-06-30"
      />,
    );

    const card = screen.getByText('Movimiento anteayer').closest('li') as HTMLElement;
    expect(within(card).queryByText(/desactualizado/i)).not.toBeInTheDocument();
    // La fecha del último movimiento se sigue mostrando SIEMPRE (REQ-VMB-10).
    expect(within(card).getByText(/28\/06\/2026/)).toBeInTheDocument();
  });

  it('presenta la suma del backend TAL CUAL (anti-recálculo) con la nota de cuentas excluidas', () => {
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
        resumen={[resumen({ suma: '1750.50', cuentasSumadas: 2, cuentasSinSaldo: 1 })]}
        totales={[]}
        hasta="2026-06-30"
      />,
    );

    // Suma BOB = el valor recibido del backend, sin sumar nada acá.
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
        resumen={[
          resumen({ moneda: 'BOB', suma: '1000.00', cuentasSumadas: 1 }),
          resumen({ moneda: 'USD', suma: '200.00', cuentasSumadas: 1 }),
        ]}
        totales={[]}
        hasta="2026-06-30"
      />,
    );

    expect(screen.getByText(/total bob/i)).toBeInTheDocument();
    expect(screen.getByText(/total usd/i)).toBeInTheDocument();
    // 1000 + 200 jamás se combinan (monedas distintas).
    expect(screen.queryByText('1.200,00')).not.toBeInTheDocument();
  });

  it('moneda con suma null (ninguna cuenta publica saldo) muestra el guión, nunca "0,00"', () => {
    render(
      <SaldosPorCuenta
        saldos={[saldo({ cuentaBancariaId: 'a', alias: 'Sin saldo' })]}
        resumen={[resumen({ suma: null, cuentasSinSaldo: 1 })]}
        totales={[]}
        hasta="2026-06-30"
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0,00')).not.toBeInTheDocument();
  });

  it('saldo y débitos/créditos comparten UNA fila por moneda (REQ-VMB-11)', () => {
    render(
      <SaldosPorCuenta
        saldos={[
          saldo({
            cuentaBancariaId: 'a',
            alias: 'BancoSol',
            saldo: '257638.93',
            fechaUltimoMovimiento: '2026-06-30',
          }),
        ]}
        resumen={[resumen({ suma: '257638.93', cuentasSumadas: 1 })]}
        totales={[
          total({ totalDebitos: '1805866.50', totalCreditos: '1735969.30', cantidad: 263 }),
        ]}
        hasta="2026-06-30"
      />,
    );

    // Los cuatro números en un mismo <p>: antes vivían en dos franjas apiladas.
    const fila = screen.getByText(/total bob/i).closest('p') as HTMLElement;
    expect(within(fila).getByText('257.638,93')).toBeInTheDocument();
    expect(within(fila).getByText('1.805.866,50')).toBeInTheDocument();
    expect(within(fila).getByText('1.735.969,30')).toBeInTheDocument();
    // Con una sola moneda el conteo NO se repite (la cabecera de la tabla ya lo dice).
    expect(within(fila).queryByText(/263 movimientos/)).not.toBeInTheDocument();
  });

  it('con varias monedas cada fila lleva su conteo y jamás se combinan importes', () => {
    render(
      <SaldosPorCuenta
        saldos={[
          saldo({ cuentaBancariaId: 'a', alias: 'BOB 1', saldo: '1000.00' }),
          saldo({ cuentaBancariaId: 'b', alias: 'USD 1', moneda: 'USD', saldo: '200.00' }),
        ]}
        resumen={[
          resumen({ moneda: 'BOB', suma: '1000.00', cuentasSumadas: 1 }),
          resumen({ moneda: 'USD', suma: '200.00', cuentasSumadas: 1 }),
        ]}
        totales={[
          total({ moneda: 'BOB', totalDebitos: '500.00', cantidad: 4 }),
          total({ moneda: 'USD', totalDebitos: '80.00', cantidad: 1 }),
        ]}
        hasta="2026-06-30"
      />,
    );

    const filaBob = screen.getByText(/total bob/i).closest('p') as HTMLElement;
    const filaUsd = screen.getByText(/total usd/i).closest('p') as HTMLElement;
    expect(within(filaBob).getByText(/4 movimientos/)).toBeInTheDocument();
    expect(within(filaUsd).getByText(/1 movimiento$/)).toBeInTheDocument();
    expect(screen.queryByText('1.200,00')).not.toBeInTheDocument();
  });

  it('una moneda que solo aparece en totales NO se pierde de la pantalla', () => {
    // Los saldos se agregan desde las CUENTAS y los totales desde los
    // MOVIMIENTOS: iterar solo `resumen` borraría esta fila entera.
    render(
      <SaldosPorCuenta
        saldos={[saldo({ cuentaBancariaId: 'a', alias: 'BOB 1', saldo: '1000.00' })]}
        resumen={[resumen({ moneda: 'BOB', suma: '1000.00', cuentasSumadas: 1 })]}
        totales={[
          total({ moneda: 'BOB', totalDebitos: '10.00' }),
          total({ moneda: 'USD', totalDebitos: '999.99', cantidad: 2 }),
        ]}
        hasta="2026-06-30"
      />,
    );

    expect(screen.getByText('999,99')).toBeInTheDocument();
    expect(screen.getByText(/USD — sin cuentas con saldo/)).toBeInTheDocument();
  });

  it('sin cuentas pero CON totales, los totales siguen en pantalla', () => {
    // Los totales pasaron a vivir dentro de este componente, así que una guarda
    // que mire solo `saldos.length` los haría desaparecer sin dejar rastro.
    const { container } = render(
      <SaldosPorCuenta
        saldos={[]}
        resumen={[]}
        totales={[total({ totalDebitos: '77.00', totalCreditos: '11.00' })]}
        hasta="2026-06-30"
      />,
    );

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText('77,00')).toBeInTheDocument();
    expect(screen.getByText('11,00')).toBeInTheDocument();
    // Sin cuentas no se renderiza la grilla de tarjetas.
    expect(container.querySelector('ul')).toBeNull();
  });

  it('sin cuentas y sin totales no renderiza nada', () => {
    const { container } = render(
      <SaldosPorCuenta saldos={[]} resumen={[]} totales={[]} hasta="2026-06-30" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('cuenta sin movimientos (null/null) aparece igual, con su indicador', () => {
    render(
      <SaldosPorCuenta
        saldos={[saldo({ cuentaBancariaId: 'n', alias: 'Cuenta nueva' })]}
        resumen={[resumen({ cuentasSinSaldo: 1 })]}
        totales={[]}
        hasta="2026-06-30"
      />,
    );

    const card = screen.getByText('Cuenta nueva').closest('li') as HTMLElement;
    expect(within(card).getByText(/sin movimientos/i)).toBeInTheDocument();
  });
});
