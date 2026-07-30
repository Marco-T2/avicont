import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { VentaEstadoCuenta } from '@/types/api';

import { VentasAbiertasTable } from './ventas-abiertas-table';

function venta(overrides: Partial<VentaEstadoCuenta> = {}): VentaEstadoCuenta {
  return {
    ventaId: 'v-1',
    fechaContable: '2026-06-01',
    fechaVencimiento: '2026-07-01',
    montoTotal: '1000.00',
    cobrado: '400.00',
    saldoPendiente: '600.00',
    estadoComercial: 'PARCIAL',
    vencida: false,
    diasAtraso: 0,
    ...overrides,
  };
}

interface Overrides {
  ventas?: VentaEstadoCuenta[];
  totalSaldoPendiente?: string;
  saldoAFavor?: string;
}

function renderTable(overrides: Overrides = {}) {
  return render(
    <VentasAbiertasTable
      ventas={overrides.ventas ?? [venta()]}
      totalSaldoPendiente={overrides.totalSaldoPendiente ?? '600.00'}
      saldoAFavor={overrides.saldoAFavor ?? '0.00'}
    />,
  );
}

describe('VentasAbiertasTable — orden canónico FIFO (REQ-CXC-05)', () => {
  it('renderiza las filas en el orden del array AUNQUE no coincida con el orden por fecha', () => {
    // El array llega deliberadamente en un orden que un sort por fechaContable
    // (asc O desc) alteraría: media, nueva, vieja. Si alguien "arregla" el
    // componente ordenando por fecha, este test se pone rojo — el orden es
    // contrato del backend (FIFO canónico), no una preferencia de UI.
    renderTable({
      ventas: [
        venta({ ventaId: 'v-media', fechaContable: '2026-06-15', saldoPendiente: '200.00' }),
        venta({ ventaId: 'v-nueva', fechaContable: '2026-07-10', saldoPendiente: '300.00' }),
        venta({ ventaId: 'v-vieja', fechaContable: '2026-05-01', saldoPendiente: '100.00' }),
      ],
    });

    const bodyRows = within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row');
    expect(bodyRows).toHaveLength(3);
    expect(bodyRows[0]).toHaveTextContent('15/06/2026');
    expect(bodyRows[1]).toHaveTextContent('10/07/2026');
    expect(bodyRows[2]).toHaveTextContent('01/05/2026');
  });

  it('no ofrece controles de sort en las columnas', () => {
    renderTable();
    const headerRow = screen.getAllByRole('rowgroup')[0]!;
    expect(within(headerRow).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('VentasAbiertasTable — fechas §4.6 (sin corrimiento UTC)', () => {
  it('formatea la fecha límite 2026-07-01 como 01/07/2026 (un parse UTC daría 30/06)', () => {
    // Mutante que caza: `new Date(iso)` + toLocaleDateString con
    // timeZone America/La_Paz interpreta el ISO como medianoche UTC y
    // renderiza 30/06/2026. El formateador correcto fija T12:00:00.
    renderTable({
      ventas: [venta({ fechaContable: '2026-07-01', fechaVencimiento: '2026-08-01' })],
    });
    expect(screen.getByText('01/07/2026')).toBeInTheDocument();
    expect(screen.getByText('01/08/2026')).toBeInTheDocument();
    expect(screen.queryByText('30/06/2026')).not.toBeInTheDocument();
    expect(screen.queryByText('31/07/2026')).not.toBeInTheDocument();
  });

  it('vencimiento null se muestra como "—" y nunca vencida (lo deriva el backend)', () => {
    renderTable({
      ventas: [venta({ fechaVencimiento: null, vencida: false, diasAtraso: 0 })],
    });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();
  });
});

describe('VentasAbiertasTable — montos §4.5 (render sin recalcular)', () => {
  it('muestra el saldoPendiente del backend aunque NO sea montoTotal − cobrado', () => {
    // Data deliberadamente inconsistente: si el componente calculara
    // 1000 − 400 = 600, este test se pone rojo. La verdad es del backend.
    renderTable({
      ventas: [
        venta({ montoTotal: '1000.00', cobrado: '400.00', saldoPendiente: '599.99' }),
      ],
      totalSaldoPendiente: '599.99',
    });
    expect(screen.getAllByText('599,99').length).toBeGreaterThan(0);
    expect(screen.queryByText('600,00')).not.toBeInTheDocument();
  });

  it('el total del pie es el del backend, no la suma de las filas', () => {
    // Dos filas que suman 500, total del backend deliberadamente distinto:
    // si alguien suma filas en el cliente, se pone rojo.
    renderTable({
      ventas: [
        venta({ ventaId: 'v-1', saldoPendiente: '200.00' }),
        venta({ ventaId: 'v-2', saldoPendiente: '300.00' }),
      ],
      totalSaldoPendiente: '123.45',
    });
    const footer = screen.getAllByRole('rowgroup')[2]!;
    expect(within(footer).getByText('123,45')).toBeInTheDocument();
    expect(within(footer).queryByText('500,00')).not.toBeInTheDocument();
  });
});

describe('VentasAbiertasTable — señal de vencida (§10: color + texto)', () => {
  it('venta vencida muestra badge con texto "Vencida" y los días de atraso del backend', () => {
    renderTable({
      ventas: [venta({ vencida: true, diasAtraso: 3 })],
    });
    expect(screen.getByText(/Vencida · 3 días/)).toBeInTheDocument();
  });

  it('singulariza 1 día de atraso', () => {
    renderTable({ ventas: [venta({ vencida: true, diasAtraso: 1 })] });
    expect(screen.getByText(/Vencida · 1 día$/)).toBeInTheDocument();
  });

  it('venta no vencida muestra "Al día"', () => {
    renderTable({ ventas: [venta({ vencida: false, diasAtraso: 0 })] });
    expect(screen.getByText('Al día')).toBeInTheDocument();
    expect(screen.queryByText(/Vencida/)).not.toBeInTheDocument();
  });

  it('muestra el estado comercial como texto legible', () => {
    renderTable({
      ventas: [
        venta({ ventaId: 'v-1', estadoComercial: 'ABIERTA' }),
        venta({ ventaId: 'v-2', estadoComercial: 'PARCIAL' }),
      ],
    });
    expect(screen.getByText('Abierta')).toBeInTheDocument();
    expect(screen.getByText('Parcial')).toBeInTheDocument();
  });
});

describe('VentasAbiertasTable — empty state (sin deuda ≠ en cero)', () => {
  it('sin ventas y sin saldo a favor: mensaje de sin deuda, sin mención de anticipos', () => {
    renderTable({ ventas: [], saldoAFavor: '0.00', totalSaldoPendiente: '0.00' });
    expect(screen.getByText(/no tiene ventas abiertas/i)).toBeInTheDocument();
    expect(screen.queryByText(/a favor/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sin ventas pero CON saldo a favor: el mensaje lo dice con el monto', () => {
    renderTable({ ventas: [], saldoAFavor: '300.00', totalSaldoPendiente: '0.00' });
    expect(screen.getByText(/no tiene ventas abiertas/i)).toBeInTheDocument();
    expect(screen.getByText(/NO está en cero/)).toBeInTheDocument();
    expect(screen.getByText(/300,00/)).toBeInTheDocument();
  });
});
