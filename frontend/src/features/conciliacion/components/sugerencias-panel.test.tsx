import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  LineaConciliacion,
  MovimientoConciliacion,
  SugerenciaConciliacion,
} from '@/types/api';

import { SugerenciasPanel } from './sugerencias-panel';

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

function linea(overrides: Partial<LineaConciliacion> = {}): LineaConciliacion {
  return {
    comprobanteId: 'comp-1',
    orden: 1,
    fecha: '2026-06-10',
    numeroComprobante: 'D2606-000001',
    glosa: 'Depósito de cliente',
    glosaLinea: null,
    monto: '1500.00',
    montoBob: '1500.00',
    tipo: 'DEBITO',
    moneda: 'BOB',
    estadoEfectivo: 'EN_TRANSITO',
    ...overrides,
  };
}

function sugerencia(overrides: Partial<SugerenciaConciliacion> = {}): SugerenciaConciliacion {
  return {
    movimientoId: 'mov-1',
    comprobanteId: 'comp-1',
    orden: 1,
    confianza: 'ALTA',
    diferenciaDias: 0,
    ...overrides,
  };
}

interface Overrides {
  sugerencias?: SugerenciaConciliacion[];
  movimientos?: MovimientoConciliacion[];
  lineas?: LineaConciliacion[];
  modoConsulta?: boolean;
  accionEnCurso?: boolean;
  onConfirmar?: (s: SugerenciaConciliacion) => void;
}

function renderPanel(overrides: Overrides = {}) {
  const props = {
    sugerencias: [sugerencia()],
    movimientos: [movimiento()],
    lineas: [linea()],
    modoConsulta: false,
    accionEnCurso: false,
    onConfirmar: vi.fn(),
    ...overrides,
  };
  render(<SugerenciasPanel {...props} />);
  return props;
}

describe('SugerenciasPanel — REQ-CB-12: ranking por confianza', () => {
  it('muestra la confianza de cada sugerencia', () => {
    renderPanel({ sugerencias: [sugerencia({ confianza: 'MEDIA', diferenciaDias: 2 })] });

    expect(screen.getByText('Media')).toBeInTheDocument();
  });

  it('ordena ALTA antes que BAJA', () => {
    renderPanel({
      sugerencias: [
        sugerencia({ movimientoId: 'mov-2', comprobanteId: 'comp-2', confianza: 'BAJA' }),
        sugerencia({ movimientoId: 'mov-1', comprobanteId: 'comp-1', confianza: 'ALTA' }),
      ],
      movimientos: [
        movimiento({ id: 'mov-1', descripcion: 'Primero' }),
        movimiento({ id: 'mov-2', descripcion: 'Segundo' }),
      ],
      lineas: [linea({ comprobanteId: 'comp-1' }), linea({ comprobanteId: 'comp-2' })],
    });

    const filas = screen.getAllByRole('row').slice(1); // sin la cabecera
    expect(within(filas[0]!).getByText('Alta')).toBeInTheDocument();
    expect(within(filas[1]!).getByText('Baja')).toBeInTheDocument();
  });

  it('muestra los datos de ambos lados del par sugerido', () => {
    renderPanel({
      sugerencias: [sugerencia({ movimientoId: 'mov-1', comprobanteId: 'comp-1', orden: 1 })],
      movimientos: [movimiento({ id: 'mov-1', descripcion: 'Depósito ABC' })],
      lineas: [linea({ comprobanteId: 'comp-1', orden: 1, glosa: 'Cobro factura 77' })],
    });

    expect(screen.getByText('Depósito ABC')).toBeInTheDocument();
    expect(screen.getByText('Cobro factura 77')).toBeInTheDocument();
  });

  it('muestra la diferencia de días cuando la fecha no es exacta', () => {
    renderPanel({
      sugerencias: [sugerencia({ confianza: 'MEDIA', diferenciaDias: 2 })],
    });

    expect(screen.getByText(/2 días/i)).toBeInTheDocument();
  });

  it('sin sugerencias muestra un empty state', () => {
    renderPanel({ sugerencias: [] });

    expect(screen.getByText(/no hay sugerencias/i)).toBeInTheDocument();
  });

  it('descarta sugerencias cuyo movimiento o línea ya no están en la respuesta', () => {
    renderPanel({
      sugerencias: [sugerencia({ movimientoId: 'mov-fantasma' })],
      movimientos: [movimiento({ id: 'mov-1' })],
    });

    expect(screen.getByText(/no hay sugerencias/i)).toBeInTheDocument();
  });
});

describe('SugerenciasPanel — confirmar (REQ-CB-17, el usuario SIEMPRE confirma)', () => {
  it('confirmar emite la sugerencia completa, incluida la confianza', async () => {
    const user = userEvent.setup();
    const s = sugerencia({
      movimientoId: 'mov-1',
      comprobanteId: 'comp-1',
      orden: 1,
      confianza: 'ALTA',
      diferenciaDias: 0,
    });
    const props = renderPanel({ sugerencias: [s] });

    await user.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(props.onConfirmar).toHaveBeenCalledWith(s);
  });

  it('con una acción en curso el botón queda deshabilitado (Anti-F-07)', () => {
    renderPanel({ accionEnCurso: true });

    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled();
  });
});

describe('SugerenciasPanel — modo consulta (REQ-CB-14 escenario 1)', () => {
  it('en modo consulta NO se renderiza el botón de confirmar', () => {
    renderPanel({ modoConsulta: true });

    expect(screen.queryByRole('button', { name: /confirmar/i })).not.toBeInTheDocument();
  });

  it('en modo consulta las sugerencias se siguen viendo', () => {
    renderPanel({
      modoConsulta: true,
      movimientos: [movimiento({ id: 'mov-1', descripcion: 'Depósito ABC' })],
    });

    expect(screen.getByText('Depósito ABC')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });
});
