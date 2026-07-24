import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MovimientoConciliacion } from '@/types/api';

import { MovimientosPanel } from './movimientos-panel';

function movimiento(overrides: Partial<MovimientoConciliacion> = {}): MovimientoConciliacion {
  return {
    id: 'mov-1',
    fecha: '2026-06-10',
    hora: null,
    monto: '1500.00',
    tipo: 'CREDITO',
    moneda: 'BOB',
    descripcion: 'Depósito en efectivo',
    referencia: null,
    saldo: null,
    estado: 'PENDIENTE',
    estadoEfectivo: 'PENDIENTE',
    vinculo: null,
    ...overrides,
  };
}

interface Overrides {
  movimientos?: MovimientoConciliacion[];
  modoConsulta?: boolean;
  seleccionadoId?: string | null;
  onSeleccionar?: (id: string) => void;
  onDeshacer?: (matchId: string) => void;
  onCambiarEstado?: (id: string, estado: 'IGNORADO' | 'PENDIENTE') => void;
  accionEnCurso?: boolean;
}

function renderPanel(overrides: Overrides = {}) {
  const props = {
    movimientos: [movimiento()],
    isLoading: false,
    modoConsulta: false,
    seleccionadoId: null,
    onSeleccionar: vi.fn(),
    onDeshacer: vi.fn(),
    onCambiarEstado: vi.fn(),
    accionEnCurso: false,
    ...overrides,
  };
  render(<MovimientosPanel {...props} />);
  return props;
}

describe('MovimientosPanel — datos del extracto', () => {
  it('muestra fecha, descripción y monto formateado del movimiento', () => {
    renderPanel({
      movimientos: [
        movimiento({ fecha: '2026-06-10', descripcion: 'Depósito ABC', monto: '1500.00' }),
      ],
    });

    expect(screen.getByText('10/06/2026')).toBeInTheDocument();
    expect(screen.getByText('Depósito ABC')).toBeInTheDocument();
    expect(screen.getByText('1.500,00')).toBeInTheDocument();
  });

  it('muestra el lado desde la perspectiva del banco', () => {
    renderPanel({ movimientos: [movimiento({ tipo: 'DEBITO' })] });

    expect(screen.getByText('Débito (salida)')).toBeInTheDocument();
  });

  it('muestra el estado EFECTIVO, no la columna persistida', () => {
    renderPanel({
      movimientos: [
        movimiento({
          estado: 'CONCILIADO',
          estadoEfectivo: 'PENDIENTE',
          vinculo: {
            matchId: 'm-1',
            comprobanteId: 'c-1',
            orden: 2,
            roto: 'LINEA_INEXISTENTE',
          },
        }),
      ],
    });

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('La línea contable ya no existe')).toBeInTheDocument();
  });

  it('sin movimientos muestra un empty state', () => {
    renderPanel({ movimientos: [] });

    expect(screen.getByText(/no hay movimientos bancarios/i)).toBeInTheDocument();
  });
});

describe('MovimientosPanel — acciones (REQ-CB-17 / REQ-CB-18)', () => {
  it('un movimiento con vínculo VÁLIDO ofrece "Deshacer" con el matchId correcto', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      movimientos: [
        movimiento({
          estado: 'CONCILIADO',
          estadoEfectivo: 'CONCILIADO',
          vinculo: { matchId: 'match-42', comprobanteId: 'c-1', orden: 1, roto: null },
        }),
      ],
    });

    await user.click(screen.getByRole('button', { name: /deshacer/i }));

    expect(props.onDeshacer).toHaveBeenCalledWith('match-42');
  });

  it('un movimiento PENDIENTE ofrece "Ignorar" y emite el estado IGNORADO', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      movimientos: [movimiento({ id: 'mov-9', estadoEfectivo: 'PENDIENTE' })],
    });

    await user.click(screen.getByRole('button', { name: /^ignorar$/i }));

    expect(props.onCambiarEstado).toHaveBeenCalledWith('mov-9', 'IGNORADO');
  });

  it('un movimiento IGNORADO ofrece des-ignorar y emite el estado PENDIENTE', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      movimientos: [
        movimiento({ id: 'mov-9', estado: 'IGNORADO', estadoEfectivo: 'IGNORADO' }),
      ],
    });

    await user.click(screen.getByRole('button', { name: /no ignorar/i }));

    expect(props.onCambiarEstado).toHaveBeenCalledWith('mov-9', 'PENDIENTE');
  });

  it('un movimiento con vínculo ROTO ofrece "Ignorar" (vuelve al pool), no "Deshacer"', () => {
    renderPanel({
      movimientos: [
        movimiento({
          estado: 'CONCILIADO',
          estadoEfectivo: 'PENDIENTE',
          vinculo: { matchId: 'm-1', comprobanteId: 'c-1', orden: 2, roto: 'MONTO_CAMBIADO' },
        }),
      ],
    });

    expect(screen.getByRole('button', { name: /^ignorar$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deshacer/i })).not.toBeInTheDocument();
  });

  it('con una acción en curso los botones quedan deshabilitados (Anti-F-07)', () => {
    renderPanel({ accionEnCurso: true });

    expect(screen.getByRole('button', { name: /^ignorar$/i })).toBeDisabled();
  });
});

describe('MovimientosPanel — selección para match manual', () => {
  it('un movimiento PENDIENTE se puede seleccionar y emite su id', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      movimientos: [movimiento({ id: 'mov-7', estadoEfectivo: 'PENDIENTE' })],
    });

    await user.click(screen.getByRole('radio', { name: /seleccionar movimiento/i }));

    expect(props.onSeleccionar).toHaveBeenCalledWith('mov-7');
  });

  it('el movimiento seleccionado aparece marcado', () => {
    renderPanel({
      movimientos: [movimiento({ id: 'mov-7', estadoEfectivo: 'PENDIENTE' })],
      seleccionadoId: 'mov-7',
    });

    expect(screen.getByRole('radio', { name: /seleccionar movimiento/i })).toBeChecked();
  });

  it('un movimiento CONCILIADO no se puede seleccionar (ya tiene contraparte)', () => {
    renderPanel({
      movimientos: [
        movimiento({
          estado: 'CONCILIADO',
          estadoEfectivo: 'CONCILIADO',
          vinculo: { matchId: 'm-1', comprobanteId: 'c-1', orden: 1, roto: null },
        }),
      ],
    });

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

describe('MovimientosPanel — modo consulta (REQ-CB-14 escenario 1)', () => {
  it('en modo consulta NO se renderiza ninguna acción de fila', () => {
    renderPanel({
      modoConsulta: true,
      movimientos: [
        movimiento({ id: 'mov-1', estadoEfectivo: 'PENDIENTE' }),
        movimiento({
          id: 'mov-2',
          estado: 'CONCILIADO',
          estadoEfectivo: 'CONCILIADO',
          vinculo: { matchId: 'm-1', comprobanteId: 'c-1', orden: 1, roto: null },
        }),
        movimiento({ id: 'mov-3', estado: 'IGNORADO', estadoEfectivo: 'IGNORADO' }),
      ],
    });

    expect(screen.queryByRole('button', { name: /ignorar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deshacer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('en modo consulta los DATOS y estados se siguen viendo', () => {
    renderPanel({
      modoConsulta: true,
      movimientos: [movimiento({ descripcion: 'Depósito ABC', estadoEfectivo: 'PENDIENTE' })],
    });

    expect(screen.getByText('Depósito ABC')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });
});
