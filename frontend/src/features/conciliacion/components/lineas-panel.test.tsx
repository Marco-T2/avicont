import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { LineaConciliacion } from '@/types/api';

import { LineasPanel } from './lineas-panel';

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

interface Overrides {
  lineas?: LineaConciliacion[];
  modoConsulta?: boolean;
  seleccionadaClave?: string | null;
  onSeleccionar?: (comprobanteId: string, orden: number) => void;
}

function renderPanel(overrides: Overrides = {}) {
  const props = {
    lineas: [linea()],
    isLoading: false,
    modoConsulta: false,
    seleccionadaClave: null,
    onSeleccionar: vi.fn(),
    ...overrides,
  };
  render(<LineasPanel {...props} />);
  return props;
}

describe('LineasPanel — líneas contables de la cuenta banco', () => {
  it('muestra fecha, número de comprobante, glosa y monto', () => {
    renderPanel({
      lineas: [
        linea({
          fecha: '2026-06-12',
          numeroComprobante: 'D2606-000042',
          glosa: 'Cobro factura 77',
          monto: '2300.50',
        }),
      ],
    });

    expect(screen.getByText('12/06/2026')).toBeInTheDocument();
    expect(screen.getByText('D2606-000042')).toBeInTheDocument();
    expect(screen.getByText('Cobro factura 77')).toBeInTheDocument();
    expect(screen.getByText('2.300,50')).toBeInTheDocument();
  });

  it('muestra el lado con el vocabulario contable (Debe / Haber)', () => {
    renderPanel({ lineas: [linea({ tipo: 'CREDITO' })] });

    expect(screen.getByText('Haber')).toBeInTheDocument();
  });

  it('una línea sin match muestra "En tránsito" (REQ-CB-11, estado DERIVADO)', () => {
    renderPanel({ lineas: [linea({ estadoEfectivo: 'EN_TRANSITO' })] });

    expect(screen.getByText('En tránsito')).toBeInTheDocument();
  });

  it('una línea con match válido muestra "Conciliado"', () => {
    renderPanel({ lineas: [linea({ estadoEfectivo: 'CONCILIADO' })] });

    expect(screen.getByText('Conciliado')).toBeInTheDocument();
  });

  it('sin líneas muestra un empty state', () => {
    renderPanel({ lineas: [] });

    expect(screen.getByText(/no hay líneas contables/i)).toBeInTheDocument();
  });

  it('un comprobante sin número (borrador nunca llega acá) cae a un guion', () => {
    renderPanel({ lineas: [linea({ numeroComprobante: null })] });

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('LineasPanel — selección para match manual', () => {
  it('una línea EN_TRANSITO se puede seleccionar y emite su ancla completa', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      lineas: [linea({ comprobanteId: 'comp-9', orden: 3, estadoEfectivo: 'EN_TRANSITO' })],
    });

    await user.click(screen.getByRole('radio', { name: /seleccionar línea/i }));

    expect(props.onSeleccionar).toHaveBeenCalledWith('comp-9', 3);
  });

  it('la línea seleccionada aparece marcada', () => {
    renderPanel({
      lineas: [linea({ comprobanteId: 'comp-9', orden: 3 })],
      seleccionadaClave: 'comp-9#3',
    });

    expect(screen.getByRole('radio', { name: /seleccionar línea/i })).toBeChecked();
  });

  it('una línea ya CONCILIADA no se puede seleccionar', () => {
    renderPanel({ lineas: [linea({ estadoEfectivo: 'CONCILIADO' })] });

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('dos líneas del mismo comprobante se renderizan ambas (clave por ancla, no por comprobante)', () => {
    renderPanel({
      lineas: [
        linea({ comprobanteId: 'comp-1', orden: 1, glosaLinea: 'Primera' }),
        linea({ comprobanteId: 'comp-1', orden: 2, glosaLinea: 'Segunda' }),
      ],
    });

    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});

describe('LineasPanel — modo consulta (REQ-CB-14 escenario 1)', () => {
  it('en modo consulta no se puede seleccionar nada', () => {
    renderPanel({ modoConsulta: true });

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('en modo consulta los datos se siguen viendo', () => {
    renderPanel({ modoConsulta: true, lineas: [linea({ glosa: 'Cobro factura 77' })] });

    expect(screen.getByText('Cobro factura 77')).toBeInTheDocument();
    expect(screen.getByText('En tránsito')).toBeInTheDocument();
  });
});
