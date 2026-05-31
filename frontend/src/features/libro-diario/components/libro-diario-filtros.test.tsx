import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Cuenta, CuentaListResponse } from '@/types/api';
import type { Periodo } from '@/types/api';

import type { LibroDiarioFiltroValues } from '../schemas/libro-diario-filtro-schema';

// Helper para crear un mock tipado de onBuscar que evita 'never' en los args.
function makeOnBuscar() {
  const calls: LibroDiarioFiltroValues[] = [];
  const fn = vi.fn((v: LibroDiarioFiltroValues) => {
    calls.push(v);
  });
  return { fn, calls };
}

// Mock de hooks cross-feature que requiere el componente.
vi.mock('@/features/periodos-fiscales/hooks/use-periodos', () => ({
  usePeriodos: vi.fn(),
}));

vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(),
}));

import { usePeriodos } from '@/features/periodos-fiscales/hooks/use-periodos';
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

import { LibroDiarioFiltros } from './libro-diario-filtros';

// ============================================================
// Fixtures
// ============================================================

function buildPeriodo(overrides: Partial<Periodo> = {}): Periodo {
  return {
    id: 'p-2026-05',
    gestionId: 'g-1',
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const CUENTA_CAJA = makeCuenta({ id: 'cuenta-uuid-1', codigoInterno: '1.1.01', nombre: 'Caja Chica' });
const CUENTA_BANCO = makeCuenta({ id: 'cuenta-uuid-2', codigoInterno: '1.1.02', nombre: 'Banco BNB' });

const mockCuentasResponse: CuentaListResponse = {
  items: [CUENTA_CAJA, CUENTA_BANCO],
  total: 2,
  page: 1,
  pageSize: 100,
};

function setupMocks() {
  (usePeriodos as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [buildPeriodo()],
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
  return render(<LibroDiarioFiltros onBuscar={onBuscar} />);
}

// ============================================================
// CuentaAutocomplete presente en el DOM
// ============================================================

describe('LibroDiarioFiltros — campo Cuenta (opcional)', () => {
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
// Comportamiento: sin cuenta seleccionada → onBuscar sin cuentaId
// ============================================================

describe('LibroDiarioFiltros — sin cuenta seleccionada', () => {
  it('en modo periodo: onBuscar no incluye cuentaId cuando no se seleccionó cuenta', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    // Seleccionar período: el SelectTrigger con id="libro-periodo" tiene role="combobox".
    const periodoTrigger = screen.getByRole('combobox', { name: /período fiscal/i });
    await user.click(periodoTrigger);
    const opcionMayo = await screen.findByRole('option', { name: /mayo 2026/i });
    await user.click(opcionMayo);

    // Pulsar Consultar sin seleccionar cuenta
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).toHaveBeenCalledTimes(1);
    const llamada = calls[0];
    expect(llamada).toBeDefined();
    expect(llamada?.cuentaId).toBeUndefined();
  });
});

// ============================================================
// Comportamiento: con cuenta seleccionada → onBuscar incluye cuentaId
// ============================================================

describe('LibroDiarioFiltros — con cuenta seleccionada', () => {
  it('en modo periodo: onBuscar incluye cuentaId cuando se seleccionó una cuenta', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    // Seleccionar período primero
    const periodoTrigger = screen.getByRole('combobox', { name: /período fiscal/i });
    await user.click(periodoTrigger);
    const opcionMayo = await screen.findByRole('option', { name: /mayo 2026/i });
    await user.click(opcionMayo);

    // Abrir el autocomplete de cuenta.
    // CuentaAutocomplete renderiza un botón con role="combobox" y texto "Todas las cuentas".
    // Hay 2 comboboxes: el de período y el de cuenta. El de período queda cerrado
    // (aria-expanded="false") tras la selección; el de cuenta tiene aria-expanded="false"
    // inicialmente. Buscamos por el segundo combobox.
    const todosComboboxes = screen.getAllByRole('combobox');
    // El segundo combobox es el de cuenta (el primero es el de período fiscal)
    const cuentaBtn = todosComboboxes[1]!;
    await user.click(cuentaBtn);
    // El popover de cmdk muestra las opciones en una lista — buscar por text
    await user.click(await screen.findByText('Caja Chica'));

    // Consultar
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    expect(onBuscar).toHaveBeenCalledTimes(1);
    const llamada = calls[0];
    expect(llamada).toBeDefined();
    expect(llamada?.cuentaId).toBe('cuenta-uuid-1');
  });
});
