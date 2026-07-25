import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MovimientoVerificador } from '@/types/api';

import { MovimientosTabla } from './movimientos-tabla';

function mov(overrides: Partial<MovimientoVerificador>): MovimientoVerificador {
  return {
    id: 'm-1',
    fecha: '2026-06-10',
    hora: null,
    monto: '1500.00',
    tipo: 'CREDITO',
    moneda: 'BOB',
    descripcion: 'DEPOSITO EN EFECTIVO',
    referencia: null,
    saldo: '9800.50',
    estado: 'PENDIENTE',
    estadoEfectivo: 'PENDIENTE',
    vinculo: null,
    cuentaBancariaId: 'cb-1',
    ordenFisico: null,
    ...overrides,
  };
}

const ALIAS = { 'cb-1': 'BancoSol operativa', 'cb-2': 'Unión ahorro' };

describe('MovimientosTabla — presentación dual del saldo (REQ-VMB-10)', () => {
  it('con cuenta seleccionada muestra la columna Saldo con el valor del banco', () => {
    render(
      <MovimientosTabla
        movimientos={[mov({})]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={true}
        monedaUnica={null}
        isLoading={false}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Saldo' })).toBeInTheDocument();
    expect(screen.getByText('9.800,50')).toBeInTheDocument();
  });

  it('en modo cross-cuenta la columna Saldo se OCULTA y aparece la columna Cuenta', () => {
    render(
      <MovimientosTabla
        movimientos={[mov({}), mov({ id: 'm-2', cuentaBancariaId: 'cb-2', saldo: '77.77' })]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={false}
        monedaUnica={null}
        isLoading={false}
      />,
    );

    expect(screen.queryByRole('columnheader', { name: 'Saldo' })).not.toBeInTheDocument();
    // El saldo por fila tampoco se cuela como celda suelta.
    expect(screen.queryByText('9.800,50')).not.toBeInTheDocument();
    expect(screen.queryByText('77,77')).not.toBeInTheDocument();
    // En cross-cuenta cada fila dice de qué banco es.
    expect(screen.getByRole('columnheader', { name: 'Cuenta' })).toBeInTheDocument();
    expect(screen.getByText('BancoSol operativa')).toBeInTheDocument();
    expect(screen.getByText('Unión ahorro')).toBeInTheDocument();
  });

  it('pinta estadoEfectivo (derivado), no la columna cacheada', () => {
    render(
      <MovimientosTabla
        movimientos={[
          // Vínculo roto: la columna dice CONCILIADO pero el derivado manda.
          mov({
            estado: 'CONCILIADO',
            estadoEfectivo: 'PENDIENTE',
            vinculo: { matchId: 'mt-1', comprobanteId: 'c-1', orden: 1, roto: 'COMPROBANTE_ANULADO' },
          }),
        ]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={true}
        monedaUnica={null}
        isLoading={false}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Pendiente');
    expect(screen.queryByText('Conciliado')).not.toBeInTheDocument();
    // El motivo del vínculo roto no se traga.
    expect(screen.getByText(/el comprobante fue anulado/i)).toBeInTheDocument();
  });

  it('formatea fecha sin corrimiento UTC y monto como string (§4.5/§4.6)', () => {
    render(
      <MovimientosTabla
        movimientos={[mov({ fecha: '2026-06-01', monto: '250.50' })]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={true}
        monedaUnica={null}
        isLoading={false}
      />,
    );

    expect(screen.getByText('01/06/2026')).toBeInTheDocument();
    expect(screen.getByText('250,50')).toBeInTheDocument();
  });

  it('con moneda única rotula el código UNA vez en la cabecera, no en cada fila', () => {
    render(
      <MovimientosTabla
        movimientos={[mov({}), mov({ id: 'm-2', monto: '20.00' })]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={true}
        monedaUnica="BOB"
        isLoading={false}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Monto (BOB)' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Saldo (BOB)' })).toBeInTheDocument();
    // Con 2 filas, el sufijo por fila habría dado 2 apariciones sueltas de 'BOB'.
    expect(screen.queryAllByText('BOB')).toHaveLength(0);
  });

  it('con más de una moneda el código SÍ va por fila (ahí discrimina)', () => {
    render(
      <MovimientosTabla
        movimientos={[mov({}), mov({ id: 'm-2', moneda: 'USD', monto: '20.00' })]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={true}
        monedaUnica={null}
        isLoading={false}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Monto' })).toBeInTheDocument();
    expect(screen.getByText('BOB')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('recorta los segundos de la hora (los extractos traen precisión de minuto)', () => {
    render(
      <MovimientosTabla
        movimientos={[mov({ hora: '13:39:00' })]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={true}
        monedaUnica="BOB"
        isLoading={false}
      />,
    );

    expect(screen.getByText('13:39')).toBeInTheDocument();
    expect(screen.queryByText('13:39:00')).not.toBeInTheDocument();
  });

  it('una hora con formato inesperado se muestra cruda en vez de recortarse a ciegas', () => {
    render(
      <MovimientosTabla
        movimientos={[mov({ hora: '9:05' })]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={true}
        monedaUnica="BOB"
        isLoading={false}
      />,
    );

    expect(screen.getByText('9:05')).toBeInTheDocument();
  });

  it('la descripción larga puede envolver: el TableCell resetea el whitespace-nowrap heredado', () => {
    const larga =
      'CREDITO TRANSFERENCIA ACH QR COBRO DE POLLO VIVO 5651023871 JUAN ALBERTO TARQUINO QUISPE BANCO FORT';
    render(
      <MovimientosTabla
        movimientos={[mov({ descripcion: larga })]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={true}
        monedaUnica="BOB"
        isLoading={false}
      />,
    );

    const p = screen.getByTitle(larga);
    // Sin el reset, el <p> hereda white-space:nowrap del TableCell y el
    // line-clamp queda muerto: una línea recortada a lo ancho, sin elipsis.
    expect(p.closest('td')).toHaveClass('whitespace-normal');
    expect(p).toHaveClass('line-clamp-2');
  });

  it('sin movimientos muestra el empty state de tabla', () => {
    render(
      <MovimientosTabla
        movimientos={[]}
        aliasPorCuenta={ALIAS}
        mostrarSaldo={false}
        monedaUnica={null}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/no hay movimientos/i)).toBeInTheDocument();
  });
});
