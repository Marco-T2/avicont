import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Gestion, Periodo } from '@/types/api';

// Mock de los hooks cross-feature que carga el componente por dentro.
vi.mock('@/features/periodos-fiscales/hooks/use-gestiones', () => ({
  useGestiones: vi.fn(),
}));
vi.mock('@/features/periodos-fiscales/hooks/use-periodos', () => ({
  usePeriodos: vi.fn(),
}));

import { useGestiones } from '@/features/periodos-fiscales/hooks/use-gestiones';
import { usePeriodos } from '@/features/periodos-fiscales/hooks/use-periodos';

import {
  PeriodoGestionFiltro,
  type PeriodoSeleccion,
} from './periodo-gestion-filtro';

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
    id: 'p-2026-01',
    gestionId: 'g-2026',
    year: 2026,
    month: 1,
    ordenEnGestion: 1,
    status: 'ABIERTO',
    esDefinitivo: false,
    closedAt: null,
    closedByUserId: null,
    fechaInicio: '2026-01-01',
    fechaFin: '2026-01-31',
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
const PERIODO_FEB = buildPeriodo({
  id: 'p-feb',
  month: 2,
  ordenEnGestion: 2,
  fechaInicio: '2026-02-01',
  fechaFin: '2026-02-28',
});
const PERIODO_DIC = buildPeriodo({
  id: 'p-dic',
  month: 12,
  ordenEnGestion: 12,
  fechaInicio: '2026-12-01',
  fechaFin: '2026-12-31',
});

function mockGestiones(data: Gestion[] | undefined, isLoading = false): void {
  (useGestiones as ReturnType<typeof vi.fn>).mockReturnValue({ data, isLoading });
}

function mockPeriodos(data: Periodo[] | undefined, isLoading = false): void {
  (usePeriodos as ReturnType<typeof vi.fn>).mockReturnValue({ data, isLoading });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Default al montar
// ============================================================

describe('PeriodoGestionFiltro — defaults al montar', () => {
  it('selecciona la gestión más reciente y "Todos", y emite el rango de toda la gestión', async () => {
    mockGestiones([
      buildGestion({ id: 'g-2025', year: 2025, status: 'CERRADA' }),
      buildGestion({ id: 'g-2026', year: 2026, status: 'ABIERTA' }),
    ]);
    mockPeriodos([PERIODO_ENE, PERIODO_FEB, PERIODO_DIC]);

    const onChange = vi.fn<(sel: PeriodoSeleccion) => void>();
    render(<PeriodoGestionFiltro value={null} onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        modo: 'rango',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
      });
    });

    // La gestión 2026 (la más reciente / abierta) aparece seleccionada.
    expect(screen.getByText(/gestión 2026/i)).toBeInTheDocument();
  });

  it('ante mismo year prefiere la gestión ABIERTA', async () => {
    mockGestiones([
      buildGestion({ id: 'g-2026-cerrada', year: 2026, status: 'CERRADA' }),
      buildGestion({ id: 'g-2026-abierta', year: 2026, status: 'ABIERTA' }),
    ]);
    mockPeriodos([PERIODO_ENE, PERIODO_DIC]);

    const onChange = vi.fn<(sel: PeriodoSeleccion) => void>();
    render(<PeriodoGestionFiltro value={null} onChange={onChange} />);

    await waitFor(() => {
      // El primer usePeriodos se llama con el id de la gestión abierta.
      expect(usePeriodos).toHaveBeenCalledWith({ gestionId: 'g-2026-abierta' });
    });
  });
});

// ============================================================
// Selección de un mes específico
// ============================================================

describe('PeriodoGestionFiltro — mes específico', () => {
  it('elegir un mes emite { modo: "periodo", periodoFiscalId }', async () => {
    const user = userEvent.setup();
    mockGestiones([buildGestion()]);
    mockPeriodos([PERIODO_ENE, PERIODO_FEB]);

    const onChange = vi.fn<(sel: PeriodoSeleccion) => void>();
    render(<PeriodoGestionFiltro value={null} onChange={onChange} />);

    // Abrir el select de Mes y elegir "Febrero".
    const mesTrigger = screen.getByRole('combobox', { name: /mes/i });
    await user.click(mesTrigger);
    await user.click(await screen.findByRole('option', { name: /febrero/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        modo: 'periodo',
        periodoFiscalId: 'p-feb',
      });
    });
  });
});

// ============================================================
// Rango personalizado
// ============================================================

describe('PeriodoGestionFiltro — rango personalizado', () => {
  it('toggle rango personalizado emite { modo: "rango" } con las fechas tipeadas', async () => {
    const user = userEvent.setup();
    mockGestiones([buildGestion()]);
    mockPeriodos([PERIODO_ENE, PERIODO_FEB]);

    const onChange = vi.fn<(sel: PeriodoSeleccion) => void>();
    render(<PeriodoGestionFiltro value={null} onChange={onChange} />);

    // Activar el toggle de rango personalizado.
    await user.click(screen.getByLabelText(/rango de fechas personalizado/i));

    const desde = screen.getByLabelText(/desde/i);
    const hasta = screen.getByLabelText(/hasta/i);

    await user.type(desde, '2026-03-01');
    await user.type(hasta, '2026-03-31');

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        modo: 'rango',
        fechaDesde: '2026-03-01',
        fechaHasta: '2026-03-31',
      });
    });
  });
});

// ============================================================
// Empty / loading
// ============================================================

describe('PeriodoGestionFiltro — estados vacío y carga', () => {
  it('sin gestiones muestra el mensaje de empty state', () => {
    mockGestiones([]);
    mockPeriodos(undefined);

    render(<PeriodoGestionFiltro value={null} onChange={vi.fn()} />);

    expect(
      screen.getByText(/no hay gestiones fiscales todavía/i),
    ).toBeInTheDocument();
  });

  it('mientras cargan las gestiones muestra el indicador de carga', () => {
    mockGestiones(undefined, true);
    mockPeriodos(undefined);

    render(<PeriodoGestionFiltro value={null} onChange={vi.fn()} />);

    expect(screen.getByText(/cargando gestiones/i)).toBeInTheDocument();
  });
});

// ============================================================
// Mensaje de error
// ============================================================

describe('PeriodoGestionFiltro — error', () => {
  it('muestra el mensaje de error provisto por el form', () => {
    mockGestiones([buildGestion()]);
    mockPeriodos([PERIODO_ENE]);

    render(
      <PeriodoGestionFiltro
        value={null}
        onChange={vi.fn()}
        error="Seleccioná un período válido"
      />,
    );

    expect(screen.getByText('Seleccioná un período válido')).toBeInTheDocument();
  });
});
