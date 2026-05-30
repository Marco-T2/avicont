import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { CuentaLibroMayor } from '@/types/api';

import { LibroMayorTabla } from './libro-mayor-tabla';

// ============================================================
// Fixtures
// ============================================================

const cuentaCaja: CuentaLibroMayor = {
  cuentaId: 'cuenta-1',
  codigoInterno: '1.1.1',
  nombreCuenta: 'Caja moneda nacional',
  naturaleza: 'DEUDORA',
  saldoInicialBob: '500.00',
  saldoFinalBob: '1500.00',
  totalDebeBob: '1000.00',
  totalHaberBob: '0.00',
  movimientos: [
    {
      comprobanteId: 'comp-1',
      numeroComprobante: 'D2605-000001',
      fechaContable: '2026-05-01',
      glosa: 'Cobro a cliente',
      glosaLinea: 'Ingreso de caja',
      estado: 'CONTABILIZADO',
      anulado: false,
      orden: 0,
      debeBob: '1000.00',
      haberBob: '0.00',
      saldoCorrienteBob: '1500.00',
    },
  ],
};

const cuentaProveedores: CuentaLibroMayor = {
  cuentaId: 'cuenta-2',
  codigoInterno: '2.1.1',
  nombreCuenta: 'Proveedores por pagar',
  naturaleza: 'ACREEDORA',
  saldoInicialBob: '0.00',
  saldoFinalBob: '800.00',
  totalDebeBob: '0.00',
  totalHaberBob: '800.00',
  movimientos: [
    {
      comprobanteId: 'comp-2',
      numeroComprobante: 'D2605-000002',
      fechaContable: '2026-05-10',
      glosa: 'Compra a crédito',
      glosaLinea: null,
      estado: 'CONTABILIZADO',
      anulado: true,
      orden: 0,
      debeBob: '0.00',
      haberBob: '800.00',
      saldoCorrienteBob: '800.00',
    },
  ],
};

function renderTabla(props: Partial<Parameters<typeof LibroMayorTabla>[0]> = {}) {
  return render(
    <LibroMayorTabla
      cuentas={[cuentaCaja, cuentaProveedores]}
      totalDebeBob="1000.00"
      totalHaberBob="800.00"
      isLoading={false}
      isError={false}
      {...props}
    />,
  );
}

// ============================================================
// Cabecera de cuenta (siempre visible)
// ============================================================

describe('LibroMayorTabla — cabecera de cuenta', () => {
  it('muestra el código interno de cada cuenta', () => {
    renderTabla();
    expect(screen.getAllByText('1.1.1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2.1.1').length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el nombre de cada cuenta', () => {
    renderTabla();
    expect(screen.getAllByText('Caja moneda nacional').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Proveedores por pagar').length).toBeGreaterThanOrEqual(1);
  });

  it('muestra la naturaleza de la cuenta', () => {
    renderTabla();
    expect(screen.getAllByText(/deudora/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/acreedora/i).length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el saldo inicial y final de la cuenta', () => {
    renderTabla({ cuentas: [cuentaCaja] });
    // saldoInicial 500.00 y saldoFinal 1500.00
    expect(screen.getAllByText(/500/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1[.,]500/).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Expansión: movimientos ocultos por default, visibles al click
// ============================================================

describe('LibroMayorTabla — expansión de movimientos', () => {
  it('oculta los movimientos por default (cuenta colapsada)', () => {
    renderTabla({ cuentas: [cuentaCaja] });
    expect(screen.queryByText('D2605-000001')).toBeNull();
  });

  it('muestra los movimientos al expandir la cuenta', async () => {
    const user = userEvent.setup();
    renderTabla({ cuentas: [cuentaCaja] });

    const toggle = screen.getByRole('button', { name: /caja moneda nacional/i });
    await user.click(toggle);

    expect(screen.getAllByText('D2605-000001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/ingreso de caja/i).length).toBeGreaterThanOrEqual(1);
  });

  it('vuelve a ocultar los movimientos al colapsar', async () => {
    const user = userEvent.setup();
    renderTabla({ cuentas: [cuentaCaja] });

    const toggle = screen.getByRole('button', { name: /caja moneda nacional/i });
    await user.click(toggle);
    expect(screen.getAllByText('D2605-000001').length).toBeGreaterThanOrEqual(1);

    await user.click(toggle);
    expect(screen.queryByText('D2605-000001')).toBeNull();
  });

  it('muestra el saldo corriente del movimiento al expandir', async () => {
    const user = userEvent.setup();
    renderTabla({ cuentas: [cuentaCaja] });
    await user.click(screen.getByRole('button', { name: /caja moneda nacional/i }));
    // saldoCorriente 1500.00
    expect(screen.getAllByText(/1[.,]500/).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Anulados
// ============================================================

describe('LibroMayorTabla — anulados', () => {
  it('marca visualmente el movimiento anulado al expandir', async () => {
    const user = userEvent.setup();
    renderTabla({ cuentas: [cuentaProveedores] });
    await user.click(screen.getByRole('button', { name: /proveedores por pagar/i }));
    expect(screen.getAllByText(/anulado/i).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Total general
// ============================================================

describe('LibroMayorTabla — total general', () => {
  it('muestra los totales generales del rango al pie', () => {
    renderTabla({ totalDebeBob: '1000.00', totalHaberBob: '800.00' });
    expect(screen.getAllByText(/1[.,]000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/800/).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Estados: vacío, error, loading
// ============================================================

describe('LibroMayorTabla — estado vacío', () => {
  it('muestra mensaje cuando no hay cuentas', () => {
    renderTabla({ cuentas: [], totalDebeBob: '0.00', totalHaberBob: '0.00' });
    expect(
      screen.getByText(/no hay (cuentas|movimientos)|sin movimientos|no se encontraron/i),
    ).toBeDefined();
  });
});

describe('LibroMayorTabla — estado de error', () => {
  it('muestra mensaje de error cuando isError es true', () => {
    renderTabla({ isError: true });
    expect(screen.getByText(/no se pudi?e?ron? cargar|error/i)).toBeDefined();
  });

  it('NO muestra las cuentas cuando hay error', () => {
    renderTabla({ isError: true, cuentas: [cuentaCaja] });
    expect(screen.queryByText('Caja moneda nacional')).toBeNull();
  });
});

describe('LibroMayorTabla — loading', () => {
  it('muestra skeletons de carga cuando isLoading es true', () => {
    const { container } = renderTabla({ isLoading: true });
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
