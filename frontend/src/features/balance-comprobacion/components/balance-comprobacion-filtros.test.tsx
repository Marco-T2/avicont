import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Gestion, Periodo } from '@/types/api';

import type { BalanceComprobacionFiltroValues } from '../schemas/balance-comprobacion-filtro-schema';

// Helper para crear un mock tipado de onBuscar que evita 'never' en los args.
function makeOnBuscar() {
  const calls: BalanceComprobacionFiltroValues[] = [];
  const fn = vi.fn((v: BalanceComprobacionFiltroValues) => {
    calls.push(v);
  });
  return { fn, calls };
}

// Mock de hooks cross-feature que requiere el componente compartido.
vi.mock('@/features/periodos-fiscales/hooks/use-gestiones', () => ({
  useGestiones: vi.fn(),
}));
vi.mock('@/features/periodos-fiscales/hooks/use-periodos', () => ({
  usePeriodos: vi.fn(),
}));

import { useGestiones } from '@/features/periodos-fiscales/hooks/use-gestiones';
import { usePeriodos } from '@/features/periodos-fiscales/hooks/use-periodos';

import { BalanceComprobacionFiltros } from './balance-comprobacion-filtros';

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

function setupMocks(periodos: Periodo[] = [PERIODO_ENE, PERIODO_MAYO, PERIODO_DIC]): void {
  (useGestiones as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [buildGestion()],
    isLoading: false,
  });
  (usePeriodos as ReturnType<typeof vi.fn>).mockReturnValue({
    data: periodos,
    isLoading: false,
  });
}

function renderFiltros(onBuscar = vi.fn()) {
  setupMocks();
  return render(<BalanceComprobacionFiltros onBuscar={onBuscar} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Default: Gestión + "Todos" → onBuscar con rango de toda la gestión
// ============================================================

describe('BalanceComprobacionFiltros — default Gestión + Todos', () => {
  it('al consultar con el default (Todos) emite rango de toda la gestión + toggle default', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalledTimes(1);
    });
    expect(calls[0]).toEqual({
      modo: 'rango',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-12-31',
      incluirAnulados: false,
    });
  });
});

// ============================================================
// Selección de un mes específico → modo periodo
// ============================================================

describe('BalanceComprobacionFiltros — mes específico', () => {
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
    expect(calls[calls.length - 1]).toMatchObject({
      modo: 'periodo',
      periodoFiscalId: 'p-mayo',
      incluirAnulados: false,
    });
  });
});

// ============================================================
// Toggle incluir anulados → onBuscar lo refleja
// ============================================================

describe('BalanceComprobacionFiltros — incluir anulados', () => {
  it('activar el toggle propaga incluirAnulados: true', async () => {
    const user = userEvent.setup();
    const { fn: onBuscar, calls } = makeOnBuscar();
    renderFiltros(onBuscar);

    await user.click(screen.getByLabelText(/incluir anulados/i));
    await user.click(screen.getByRole('button', { name: /consultar/i }));

    await waitFor(() => {
      expect(onBuscar).toHaveBeenCalled();
    });
    expect(calls[calls.length - 1]?.incluirAnulados).toBe(true);
  });
});

// ============================================================
// Rango personalizado → modo rango con fechas tipeadas
// ============================================================

describe('BalanceComprobacionFiltros — rango personalizado', () => {
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
    expect(calls[calls.length - 1]).toMatchObject({
      modo: 'rango',
      fechaDesde: '2026-03-01',
      fechaHasta: '2026-03-31',
      incluirAnulados: false,
    });
  });
});
