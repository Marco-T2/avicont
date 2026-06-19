import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Cuenta, CuentaListResponse } from '@/types/api';
import type { RangoFechas } from '@/components/shared/periodo-gestion-filtro';

import type { LibroDiarioFiltroValues } from '../schemas/libro-diario-filtro-schema';

// Helper para crear un mock tipado de onBuscar que evita 'never' en los args.
function makeOnBuscar() {
  const calls: LibroDiarioFiltroValues[] = [];
  const fn = vi.fn((v: LibroDiarioFiltroValues) => {
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

// Mock de CuentaAutocomplete (cross-feature).
vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(),
}));
vi.mock('@/features/comprobantes/components/cuenta-autocomplete', () => ({
  CuentaAutocomplete: (props: { onChange: (id: string) => void; placeholder: string }) => (
    <button
      type="button"
      data-testid="mock-cuenta-autocomplete"
      onClick={() => props.onChange('cuenta-uuid-1')}
    >
      {props.placeholder}
    </button>
  ),
}));

import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

import { LibroDiarioFiltros } from './libro-diario-filtros';

// ============================================================
// Fixtures
// ============================================================

function makeCuenta(overrides: Partial<Cuenta>): Cuenta {
  return {
    id: 'cuenta-uuid-1',
    organizationId: 'org-1',
    codigoInterno: '1.1.01',
    nombre: 'Caja Chica',
    descripcion: null,
    claseCuenta: 'ACTIVO',
    subClaseCuenta: 'ACTIVO_CORRIENTE',
    naturaleza: 'DEUDORA',
    parentId: null,
    nivel: 3,
    esDetalle: true,
    requiereContacto: false,
    esContraria: false,
    activa: true,
    monedaFuncional: 'BOB',
    permiteMultiMoneda: false,
    esSystemSeed: false,
    esRequeridaSistema: false,
    actividadFlujo: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const mockCuentasResponse: CuentaListResponse = {
  items: [makeCuenta({ id: 'cuenta-uuid-1', nombre: 'Caja Chica' })],
  total: 1,
  page: 1,
  pageSize: 100,
};

function setupMocks(): void {
  (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
    data: mockCuentasResponse,
    isLoading: false,
    isError: false,
  });
}

function renderFiltros(onBuscar = vi.fn()) {
  setupMocks();
  capturedOnChange = null;
  return render(<LibroDiarioFiltros onBuscar={onBuscar} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnChange = null;
});

// ============================================================
// Renderizado básico
// ============================================================

describe('LibroDiarioFiltros — renderizado', () => {
  it('renderiza el label "Cuenta (opcional)"', () => {
    renderFiltros();
    expect(screen.getByText('Cuenta (opcional)')).toBeInTheDocument();
  });

  it('renderiza el placeholder "Todas las cuentas" del autocomplete', () => {
    renderFiltros();
    expect(screen.getByText('Todas las cuentas')).toBeInTheDocument();
  });

  it('renderiza el botón Consultar habilitado por defecto', () => {
    renderFiltros();
    const btn = screen.getByRole('button', { name: /consultar/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('botón Consultar muestra "Consultando…" y está deshabilitado cuando isFetching=true', () => {
    setupMocks();
    render(<LibroDiarioFiltros onBuscar={vi.fn()} isFetching />);
    const btn = screen.getByRole('button', { name: /consultando/i });
    expect(btn).toBeDisabled();
  });
});

// ============================================================
// Sin selección: error de validación
// ============================================================

describe('LibroDiarioFiltros — validación sin selección', () => {
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

describe('LibroDiarioFiltros — consultar con rango válido', () => {
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
    expect(calls[0]?.cuentaId).toBeUndefined();
  });

  it('onBuscar emite cuentaId cuando se selecciona una cuenta', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    // Emitir rango y seleccionar cuenta
    await user.click(screen.getByTestId('mock-emitir-rango'));
    await user.click(screen.getByTestId('mock-cuenta-autocomplete'));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalled();
    });
    expect(calls[calls.length - 1]?.cuentaId).toBe('cuenta-uuid-1');
  });

  it('onBuscar emite incluirAnulados: true cuando el toggle está activo', async () => {
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

  it('consultar emite fechaDesde y fechaHasta (no periodoFiscalId)', async () => {
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
});

// ============================================================
// Rango personalizado emitido por el mock del componente compartido
// ============================================================

describe('LibroDiarioFiltros — rango personalizado via capturedOnChange', () => {
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
