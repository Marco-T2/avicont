import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Gestion } from '@/types/api';

// Mock hooks cross-feature.
vi.mock('@/features/periodos-fiscales/hooks/use-gestiones', () => ({
  useGestiones: vi.fn(),
}));

// Mock de las funciones de fecha-actual para tests deterministas.
vi.mock('@/lib/fecha-actual', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/fecha-actual')>();
  return {
    ...real,
    primerDiaDelMesISO: vi.fn(() => '2026-06-01'),
    ultimoDiaDelMesISO: vi.fn(() => '2026-06-30'),
    rangoMesAnteriorISO: vi.fn(() => ({ fechaDesde: '2026-05-01', fechaHasta: '2026-05-31' })),
  };
});

import { useGestiones } from '@/features/periodos-fiscales/hooks/use-gestiones';
import { primerDiaDelMesISO, rangoMesAnteriorISO, ultimoDiaDelMesISO } from '@/lib/fecha-actual';

import { PeriodoGestionFiltro, type RangoFechas } from './periodo-gestion-filtro';

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

const GESTION_2026 = buildGestion({ id: 'g-2026', year: 2026, mesInicio: 1, status: 'ABIERTA' });
const GESTION_2025 = buildGestion({ id: 'g-2025', year: 2025, mesInicio: 1, status: 'CERRADA' });
const GESTION_2026_INDUSTRIAL = buildGestion({
  id: 'g-2026-ind',
  year: 2026,
  mesInicio: 4,
  status: 'ABIERTA',
});

function mockGestiones(data: Gestion[] | undefined, isLoading = false): void {
  (useGestiones as ReturnType<typeof vi.fn>).mockReturnValue({ data, isLoading });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restaurar defaults del mock
  (primerDiaDelMesISO as ReturnType<typeof vi.fn>).mockReturnValue('2026-06-01');
  (ultimoDiaDelMesISO as ReturnType<typeof vi.fn>).mockReturnValue('2026-06-30');
  (rangoMesAnteriorISO as ReturnType<typeof vi.fn>).mockReturnValue({
    fechaDesde: '2026-05-01',
    fechaHasta: '2026-05-31',
  });
});

// ============================================================
// TEST DE REGRESIÓN DEL BUG — el más importante
// Antes: emitía undefined porque dependía de fechaInicio/fechaFin del backend
// Ahora: SIEMPRE emite { fechaDesde, fechaHasta } no-vacíos para gestión ABIERTA
// ============================================================

describe('PeriodoGestionFiltro — regresión bug: gestión ABIERTA emite rango no-vacío', () => {
  it('default al montar sobre gestión ABIERTA 2026 mesInicio=1: emite rango completo de la gestión', async () => {
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
      });
    });
  });
});

// ============================================================
// Default al montar
// ============================================================

describe('PeriodoGestionFiltro — defaults al montar', () => {
  it('con múltiples gestiones selecciona la más reciente (year DESC, ABIERTA primero)', async () => {
    mockGestiones([GESTION_2025, GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
      });
    });
  });

  it('gestión con mesInicio=4 (industrial): emite rango 2026-04-01 / 2027-03-31', async () => {
    mockGestiones([GESTION_2026_INDUSTRIAL]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        fechaDesde: '2026-04-01',
        fechaHasta: '2027-03-31',
      });
    });
  });

  it('preset por defecto visible es "Esta gestión"', async () => {
    mockGestiones([GESTION_2026]);
    render(<PeriodoGestionFiltro onChange={vi.fn()} />);
    // El trigger del Select debe mostrar "Esta gestión"
    expect(await screen.findByText(/esta gestión/i)).toBeInTheDocument();
  });
});

// ============================================================
// Cada preset resuelve las fechas correctas
// ============================================================

describe('PeriodoGestionFiltro — presets', () => {
  it('preset "Gestión anterior" con gestión 2025 existente emite rango correcto', async () => {
    const user = userEvent.setup();
    mockGestiones([GESTION_2026, GESTION_2025]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /gestión anterior/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        fechaDesde: '2025-01-01',
        fechaHasta: '2025-12-31',
      });
    });
  });

  it('preset "Este mes" emite fechas del mes actual (mockeado a junio 2026)', async () => {
    const user = userEvent.setup();
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /este mes/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        fechaDesde: '2026-06-01',
        fechaHasta: '2026-06-30',
      });
    });
  });

  it('preset "Mes anterior" emite fechas del mes anterior (mockeado a mayo 2026)', async () => {
    const user = userEvent.setup();
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /mes anterior/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
      });
    });
  });

  it('preset "Mes anterior" en enero (cruce de año) llama rangoMesAnteriorISO con resultado correcto', async () => {
    const user = userEvent.setup();
    (rangoMesAnteriorISO as ReturnType<typeof vi.fn>).mockReturnValue({
      fechaDesde: '2025-12-01',
      fechaHasta: '2025-12-31',
    });
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /mes anterior/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        fechaDesde: '2025-12-01',
        fechaHasta: '2025-12-31',
      });
    });
  });

  it('preset "Gestión anterior" sin gestión previa: opción deshabilitada y no emite onChange adicional', async () => {
    const user = userEvent.setup();
    // Solo hay una gestión — no hay "anterior"
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    // Esperar que se emita el default
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);

    // La opción de "Gestión anterior" debe estar deshabilitada
    const opcionGestionAnterior = await screen.findByRole('option', {
      name: /gestión anterior/i,
    });
    expect(opcionGestionAnterior).toHaveAttribute('data-disabled');

    // No se puede hacer click en una opción deshabilitada; onChange sigue en 1
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('preset "Personalizado" no emite onChange al montar (fechas vacías)', async () => {
    const user = userEvent.setup();
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    // Esperar que el default emita
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /personalizado/i }));

    // Personalizado con fechas vacías NO debe emitir
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================
// Edición manual de inputs
// ============================================================

describe('PeriodoGestionFiltro — edición manual de inputs', () => {
  it('editar el input Hasta cambia preset a "Personalizado" y emite las fechas cuando ambas están completas', async () => {
    const user = userEvent.setup();
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    // Esperar el emit del default (esta-gestión 2026)
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    // Seleccionar "Este mes" para que los inputs queden poblados con fechas
    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /este mes/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        fechaDesde: '2026-06-01',
        fechaHasta: '2026-06-30',
      });
    });

    // Ahora editar el input Hasta manualmente
    const hastaInput = screen.getByLabelText(/hasta/i);
    await user.clear(hastaInput);
    await user.type(hastaInput, '2026-06-15');

    // El preset debe mostrar "Personalizado"
    await waitFor(() => {
      expect(screen.getByText(/personalizado/i)).toBeInTheDocument();
    });

    // Y debe emitir el rango con la nueva fecha Hasta (Desde sigue siendo 2026-06-01)
    await waitFor(() => {
      const calls = (onChange as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1]?.[0] as RangoFechas | undefined;
      expect(lastCall?.fechaHasta).toBe('2026-06-15');
      expect(lastCall?.fechaDesde).toBe('2026-06-01');
    });
  });

  it('editar el input Desde cambia preset a "Personalizado"', async () => {
    const user = userEvent.setup();
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    const desdeInput = screen.getByLabelText(/desde/i);
    await user.clear(desdeInput);
    await user.type(desdeInput, '2026-03-01');

    await waitFor(() => {
      expect(screen.getByText(/personalizado/i)).toBeInTheDocument();
    });
  });

  it('seleccionar preset DESPUÉS de editar a mano sobreescribe las fechas', async () => {
    const user = userEvent.setup();
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    // Editar a mano
    const desdeInput = screen.getByLabelText(/desde/i);
    await user.clear(desdeInput);
    await user.type(desdeInput, '2026-03-01');

    // Luego volver a "Este mes"
    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /este mes/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        fechaDesde: '2026-06-01',
        fechaHasta: '2026-06-30',
      });
    });
  });

  it('Desde > Hasta: onChange no se vuelve a emitir con ese rango inválido', async () => {
    const user = userEvent.setup();
    mockGestiones([GESTION_2026]);

    const onChange = vi.fn<(rango: RangoFechas) => void>();
    render(<PeriodoGestionFiltro onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    // Forzar personalizado con fechas donde Desde > Hasta
    const trigger = screen.getByRole('combobox', { name: /preset de período/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /personalizado/i }));

    const desdeInput = screen.getByLabelText(/desde/i);
    const hastaInput = screen.getByLabelText(/hasta/i);
    await user.type(desdeInput, '2026-12-01');
    await user.type(hastaInput, '2026-01-01');

    // El componente no debe emitir onChange con rango inválido
    // (la firma del useMemo devuelve null para ese caso)
    // Verificar que no se emitió un rango donde desde > hasta
    const calls = (onChange as ReturnType<typeof vi.fn>).mock.calls;
    const rangosInvalidos = calls.filter(([rango]) => {
      const r = rango as RangoFechas;
      return r.fechaDesde > r.fechaHasta;
    });
    expect(rangosInvalidos).toHaveLength(0);
  });
});

// ============================================================
// Estados vacío y carga
// ============================================================

describe('PeriodoGestionFiltro — estados vacío y carga', () => {
  it('sin gestiones muestra el mensaje de empty state', () => {
    mockGestiones([]);

    render(<PeriodoGestionFiltro onChange={vi.fn()} />);

    expect(
      screen.getByText(/no hay gestiones fiscales todavía/i),
    ).toBeInTheDocument();
  });

  it('mientras cargan las gestiones muestra el indicador de carga', () => {
    mockGestiones(undefined, true);

    render(<PeriodoGestionFiltro onChange={vi.fn()} />);

    expect(screen.getByText(/cargando gestiones/i)).toBeInTheDocument();
  });
});

// ============================================================
// Mensaje de error
// ============================================================

describe('PeriodoGestionFiltro — error', () => {
  it('muestra el mensaje de error provisto por el caller', async () => {
    mockGestiones([GESTION_2026]);

    render(
      <PeriodoGestionFiltro
        onChange={vi.fn()}
        error="El rango de fechas no es válido"
      />,
    );

    expect(
      await screen.findByText('El rango de fechas no es válido'),
    ).toBeInTheDocument();
  });
});
