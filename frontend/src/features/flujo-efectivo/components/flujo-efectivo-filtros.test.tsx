import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RangoFechas } from '@/components/shared/periodo-gestion-filtro';

import type { FlujoEfectivoFiltroValues } from '../schemas/flujo-efectivo-filtro-schema';

// Helper para crear un mock tipado de onBuscar que evita 'never' en los args.
function makeOnBuscar() {
  const calls: FlujoEfectivoFiltroValues[] = [];
  const fn = vi.fn((v: FlujoEfectivoFiltroValues) => {
    calls.push(v);
  });
  return { fn, calls };
}

// ============================================================
// Mock del componente compartido PeriodoGestionFiltro.
// Lo reemplazamos con un botón que el test puede usar para emitir
// un RangoFechas determinista vía el prop onChange.
// ============================================================
let capturedOnChange: ((rango: RangoFechas) => void) | null = null;

vi.mock('@/components/shared/periodo-gestion-filtro', () => ({
  PeriodoGestionFiltro: (props: {
    onChange: (rango: RangoFechas) => void;
    error?: string;
  }) => {
    capturedOnChange = props.onChange;
    return (
      <div>
        <button
          type="button"
          data-testid="mock-emitir-rango"
          onClick={() =>
            props.onChange({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' })
          }
        >
          Emitir rango por defecto
        </button>
        {props.error !== undefined && (
          <p data-testid="periodo-error">{props.error}</p>
        )}
      </div>
    );
  },
}));

import { FlujoEfectivoFiltros } from './flujo-efectivo-filtros';

function renderFiltros(onBuscar = vi.fn()) {
  capturedOnChange = null;
  return render(<FlujoEfectivoFiltros onBuscar={onBuscar} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnChange = null;
});

// ============================================================
// Renderizado básico
// ============================================================

describe('FlujoEfectivoFiltros — renderizado', () => {
  it('renderiza el label "Incluir anulados"', () => {
    renderFiltros();
    expect(screen.getByText(/incluir anulados/i)).toBeInTheDocument();
  });

  it('renderiza el botón Consultar habilitado por defecto', () => {
    renderFiltros();
    const btn = screen.getByRole('button', { name: /consultar/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('botón Consultar muestra "Consultando…" y está deshabilitado cuando isFetching=true', () => {
    render(<FlujoEfectivoFiltros onBuscar={vi.fn()} isFetching />);
    const btn = screen.getByRole('button', { name: /consultando/i });
    expect(btn).toBeDisabled();
  });
});

// ============================================================
// Sin selección: error de validación
// ============================================================

describe('FlujoEfectivoFiltros — validación sin selección', () => {
  it('consultar sin emitir rango previo muestra error y NO llama onBuscar', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar } = makeOnBuscar();
    renderFiltros(onBuscar);

    // NO emitimos rango desde el mock → seleccion === null
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).not.toHaveBeenCalled();
    expect(screen.getByTestId('periodo-error')).toBeInTheDocument();
  });
});

// ============================================================
// Consultar con rango válido → emite fechaDesde/fechaHasta
// ============================================================

describe('FlujoEfectivoFiltros — consultar con rango válido', () => {
  it('consultar tras emitir rango emite { fechaDesde, fechaHasta, incluirAnulados: false }', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    // Simular que PeriodoGestionFiltro emite un rango
    await user.click(screen.getByTestId('mock-emitir-rango'));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalledTimes(1);
    });
    expect(calls[0]).toEqual({
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-12-31',
      incluirAnulados: false,
    });
  });

  it('consultar emite fechaDesde y fechaHasta (sin periodoFiscalId ni modo)', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    await user.click(screen.getByTestId('mock-emitir-rango'));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalled();
    });
    const llamada = calls[0];
    expect(llamada).toHaveProperty('fechaDesde');
    expect(llamada).toHaveProperty('fechaHasta');
    expect(llamada).not.toHaveProperty('periodoFiscalId');
    expect(llamada).not.toHaveProperty('modo');
  });

  it('activar el toggle "Incluir anulados" propaga incluirAnulados: true', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    await user.click(screen.getByTestId('mock-emitir-rango'));
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalled();
    });
    expect(calls[calls.length - 1]?.incluirAnulados).toBe(true);
  });

  it('emitir un nuevo rango limpia el error previo', async () => {
    const user = userEvent.setup();
    renderFiltros();

    // Primero provocar el error
    await user.click(screen.getByRole('button', { name: /consultar/i }));
    expect(screen.getByTestId('periodo-error')).toBeInTheDocument();

    // Luego emitir un rango → el error desaparece
    await user.click(screen.getByTestId('mock-emitir-rango'));

    await waitFor(() => {
      expect(screen.queryByTestId('periodo-error')).toBeNull();
    });
  });
});

// ============================================================
// Rango personalizado emitido por el mock del componente compartido
// ============================================================

describe('FlujoEfectivoFiltros — rango personalizado via capturedOnChange', () => {
  it('onChange capturado permite emitir cualquier rango personalizado', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    // Emitir rango personalizado directo vía la referencia capturada
    expect(capturedOnChange).not.toBeNull();
    capturedOnChange?.({ fechaDesde: '2026-03-01', fechaHasta: '2026-03-31' });

    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalled();
    });
    expect(calls[calls.length - 1]).toMatchObject({
      fechaDesde: '2026-03-01',
      fechaHasta: '2026-03-31',
      incluirAnulados: false,
    });
  });
});
