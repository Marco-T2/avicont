import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { VentaEstadoCuenta } from '@/types/api';

import type { FilaAplicacion } from '../lib/auto-tilde-fifo';
import { VentasAbiertasFifo } from './ventas-abiertas-fifo';

function venta(overrides: Partial<VentaEstadoCuenta> & { ventaId: string }): VentaEstadoCuenta {
  return {
    fechaContable: '2026-06-01',
    fechaVencimiento: '2026-07-01',
    montoTotal: '300.00',
    cobrado: '0.00',
    saldoPendiente: '300.00',
    estadoComercial: 'ABIERTA',
    vencida: false,
    diasAtraso: 0,
    ...overrides,
  };
}

// El array llega EN EL ORDEN DEL BACKEND y la fila más nueva va primera a
// propósito: la tabla debe renderizar ese orden tal cual (REQ-CXC-05).
const VENTAS = [
  venta({ ventaId: 'v-nueva', fechaContable: '2026-07-01' }),
  venta({ ventaId: 'v-vieja', fechaContable: '2026-06-01' }),
];

const FILAS: FilaAplicacion[] = [
  { ventaId: 'v-nueva', tildada: true, montoAplicado: '300.00' },
  { ventaId: 'v-vieja', tildada: false, montoAplicado: '' },
];

describe('VentasAbiertasFifo', () => {
  it('renderiza las filas en el orden del array, sin reordenar por fecha', () => {
    render(
      <VentasAbiertasFifo
        ventas={VENTAS}
        filas={FILAS}
        onToggle={vi.fn()}
        onMontoChange={vi.fn()}
      />,
    );

    const filas = screen.getAllByTestId(/fila-venta-/);
    expect(filas[0]).toHaveAttribute('data-testid', 'fila-venta-v-nueva');
    expect(filas[1]).toHaveAttribute('data-testid', 'fila-venta-v-vieja');
  });

  it('el checkbox refleja la tilde y emite onToggle con el ventaId', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <VentasAbiertasFifo
        ventas={VENTAS}
        filas={FILAS}
        onToggle={onToggle}
        onMontoChange={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    await user.click(checkboxes[1]!);
    expect(onToggle).toHaveBeenCalledWith('v-vieja');
  });

  it('el input de monto es editable solo en filas tildadas y emite onMontoChange', async () => {
    const user = userEvent.setup();
    const onMontoChange = vi.fn();
    render(
      <VentasAbiertasFifo
        ventas={VENTAS}
        filas={FILAS}
        onToggle={vi.fn()}
        onMontoChange={onMontoChange}
      />,
    );

    const filaTildada = screen.getByTestId('fila-venta-v-nueva');
    const inputTildado = within(filaTildada).getByRole('textbox');
    expect(inputTildado).toHaveValue('300.00');
    await user.type(inputTildado, '1');
    expect(onMontoChange).toHaveBeenCalledWith('v-nueva', '300.001');

    const filaNoTildada = screen.getByTestId('fila-venta-v-vieja');
    expect(within(filaNoTildada).getByRole('textbox')).toBeDisabled();
  });

  it('muestra el badge de vencida con los días de atraso', () => {
    render(
      <VentasAbiertasFifo
        ventas={[venta({ ventaId: 'v-1', vencida: true, diasAtraso: 3 })]}
        filas={[{ ventaId: 'v-1', tildada: false, montoAplicado: '' }]}
        onToggle={vi.fn()}
        onMontoChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Vencida · 3 días')).toBeInTheDocument();
  });

  it('disabled deshabilita checkboxes e inputs (Anti-F-07 durante el guardado)', () => {
    render(
      <VentasAbiertasFifo
        ventas={VENTAS}
        filas={FILAS}
        onToggle={vi.fn()}
        onMontoChange={vi.fn()}
        disabled
      />,
    );
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled();
    }
  });
});
