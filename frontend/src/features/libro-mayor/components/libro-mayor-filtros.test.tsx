import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Cuenta,
  CuentaListResponse,
  Gestion,
  Periodo,
} from '@/types/api';

import type { LibroMayorFiltroValues } from '../schemas/libro-mayor-filtro-schema';

// Helper para crear un mock tipado de onBuscar que evita 'never' en los args.
function makeOnBuscar() {
  const calls: LibroMayorFiltroValues[] = [];
  const fn = vi.fn((v: LibroMayorFiltroValues) => {
    calls.push(v);
  });
  return { fn, calls };
}

// Mock de hooks cross-feature que requiere el componente (directa o indirectamente).
vi.mock('@/features/periodos-fiscales/hooks/use-gestiones', () => ({
  useGestiones: vi.fn(),
}));
vi.mock('@/features/periodos-fiscales/hooks/use-periodos', () => ({
  usePeriodos: vi.fn(),
}));
vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(),
}));

import { useGestiones } from '@/features/periodos-fiscales/hooks/use-gestiones';
import { usePeriodos } from '@/features/periodos-fiscales/hooks/use-periodos';
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

import { LibroMayorFiltros } from './libro-mayor-filtros';

// ============================================================
// Fixtures
// ============================================================

function buildGestion(overrides: Partial<Gestion> = {}): Gestion {
  return {
    id: 'g-2026',
    year: 2026,
    mesInicio: 1,
    status: 'ABIERTA',
    closedAt: null,
    closedByUserId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function buildPeriodo(overrides: Partial<Periodo> = {}): Periodo {
  return {
    id: 'p-2026-05',
    gestionId: 'g-2026',
    year: 2026,
    month: 5,
    ordenEnGestion: 5,
    status: 'ABIERTO',
    esDefinitivo: false,
    closedAt: null,
    closedByUserId: null,
    fechaInicio: '2026-05-01',
    fechaFin: '2026-05-31',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

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

const PERIODO_ENE = buildPeriodo({
  id: 'p-ene',
  month: 1,
  ordenEnGestion: 1,
  fechaInicio: '2026-01-01',
  fechaFin: '2026-01-31',
});
const PERIODO_MAYO = buildPeriodo({
  id: 'p-mayo',
  month: 5,
  ordenEnGestion: 5,
  fechaInicio: '2026-05-01',
  fechaFin: '2026-05-31',
});
const PERIODO_DIC = buildPeriodo({
  id: 'p-dic',
  month: 12,
  ordenEnGestion: 12,
  fechaInicio: '2026-12-01',
  fechaFin: '2026-12-31',
});

const CUENTA_CAJA = makeCuenta({
  id: 'cuenta-uuid-1',
  codigoInterno: '1.1.01',
  nombre: 'Caja Chica',
});
const CUENTA_BANCO = makeCuenta({
  id: 'cuenta-uuid-2',
  codigoInterno: '1.1.02',
  nombre: 'Banco BNB',
});

const mockCuentasResponse: CuentaListResponse = {
  items: [CUENTA_CAJA, CUENTA_BANCO],
  total: 2,
  page: 1,
  pageSize: 100,
};

function setupMocks(periodos: Periodo[] = [PERIODO_ENE, PERIODO_MAYO, PERIODO_DIC]): void {
  (useGestiones as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [buildGestion()],
    isLoading: false,
  });
  (usePeriodos as ReturnType<typeof vi.fn>).mockReturnValue({
    data: periodos,
    isLoading: false,
  });
  (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
    data: mockCuentasResponse,
    isLoading: false,
    isError: false,
  });
}

function renderFiltros(onBuscar = vi.fn()) {
  setupMocks();
  return render(<LibroMayorFiltros onBuscar={onBuscar} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// CuentaAutocomplete presente en el DOM
// ============================================================

describe('LibroMayorFiltros — campo Cuenta (opcional)', () => {
  it('renderiza el label "Cuenta (opcional)" visible en el formulario', () => {
    renderFiltros();
    expect(screen.getByText('Cuenta (opcional)')).toBeInTheDocument();
  });

  it('renderiza el placeholder "Todas las cuentas" del autocomplete de cuenta', () => {
    renderFiltros();
    expect(screen.getByText('Todas las cuentas')).toBeInTheDocument();
  });
});

// ============================================================
// Default: Gestión + "Todos" → onBuscar con rango de toda la gestión
// ============================================================

describe('LibroMayorFiltros — default Gestión + Todos', () => {
  it('al consultar con el default (Todos) emite rango de toda la gestión + toggles default', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalledTimes(1);
    });
    const llamada = calls[0];
    expect(llamada).toEqual({
      modo: 'rango',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-12-31',
      incluirAnulados: false,
      soloConMovimiento: true,
    });
    expect(llamada?.cuentaId).toBeUndefined();
  });
});

// ============================================================
// Selección de un mes específico → modo periodo
// ============================================================

describe('LibroMayorFiltros — mes específico', () => {
  it('elegir un mes y consultar emite { modo: "periodo", periodoFiscalId }', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    const mesTrigger = screen.getByRole('combobox', { name: /mes/i });
    await user.click(mesTrigger);
    await user.click(await screen.findByRole('option', { name: /mayo/i }));

    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalled();
    });
    const llamada = calls[calls.length - 1];
    expect(llamada).toMatchObject({
      modo: 'periodo',
      periodoFiscalId: 'p-mayo',
      incluirAnulados: false,
      soloConMovimiento: true,
    });
  });
});

// ============================================================
// Con cuenta seleccionada → onBuscar incluye cuentaId
// ============================================================

describe('LibroMayorFiltros — con cuenta seleccionada', () => {
  it('onBuscar incluye cuentaId cuando se seleccionó una cuenta', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    // Hay 3 comboboxes: gestión (0), mes (1) y cuenta (2). El de cuenta es el
    // botón de CuentaAutocomplete (PopoverTrigger), que va último en el DOM.
    const comboboxes = screen.getAllByRole('combobox');
    const cuentaBtn = comboboxes[comboboxes.length - 1]!;
    await user.click(cuentaBtn);
    await user.click(await screen.findByText('Caja Chica'));

    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalled();
    });
    const llamada = calls[calls.length - 1];
    expect(llamada?.cuentaId).toBe('cuenta-uuid-1');
  });
});

// ============================================================
// Rango personalizado → modo rango con fechas tipeadas
// ============================================================

describe('LibroMayorFiltros — rango personalizado', () => {
  it('toggle rango + fechas → onBuscar { modo: "rango", fechaDesde, fechaHasta }', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    await user.click(screen.getByLabelText(/rango de fechas personalizado/i));
    await user.type(screen.getByLabelText(/^desde$/i), '2026-03-01');
    await user.type(screen.getByLabelText(/^hasta$/i), '2026-03-31');

    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalled();
    });
    const llamada = calls[calls.length - 1];
    expect(llamada).toMatchObject({
      modo: 'rango',
      fechaDesde: '2026-03-01',
      fechaHasta: '2026-03-31',
      incluirAnulados: false,
      soloConMovimiento: true,
    });
  });
});
