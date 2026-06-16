/**
 * Tests de LibroDiarioPage.
 *
 * R7: card wrapper `rounded-lg border bg-card p-4` en el bloque de filtros.
 * R9: el `rango` para el nombre del archivo de export debe provenir de
 *     data.rango (fechas resueltas por el backend), NO de los params locales
 *     (que en modo período solo tienen el UUID del periodoFiscalId).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LibroDiarioResponse } from '@/types/api';

import { LibroDiarioPage } from './libro-diario-page';

// Mocks de hooks cross-feature requeridos por la página.
vi.mock('@/features/tenants/hooks/use-empresa', () => ({
  useEmpresa: () => ({ data: null }),
}));

const mockUseLibroDiario = vi.fn();
vi.mock('../hooks/use-libro-diario', () => ({
  useLibroDiario: (...args: unknown[]) => mockUseLibroDiario(...args),
}));

// El componente LibroDiarioFiltros tiene sus propios hooks internos; mockeamos el
// componente completo para aislar el test de la página.
vi.mock('../components/libro-diario-filtros', () => ({
  LibroDiarioFiltros: () => <div data-testid="libro-diario-filtros">Filtros</div>,
}));

vi.mock('../components/libro-diario-tabla', () => ({
  LibroDiarioTabla: () => <div data-testid="libro-diario-tabla">Tabla</div>,
}));

// Capturar el rango que la página pasa al botón de exportar (R9).
const mockBotonExportar = vi.fn();
vi.mock('../components/boton-exportar-libro-diario', () => ({
  BotonExportarLibroDiario: (props: { rango: string }) => {
    mockBotonExportar(props);
    return <button>Exportar a Excel</button>;
  },
}));

const dataConPeriodo: LibroDiarioResponse = {
  rango: { fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' },
  asientos: [],
  totalDebeBob: '0.00',
  totalHaberBob: '0.00',
};

// Estado por defecto: sin datos (estado inicial / sin búsqueda activa).
function mockSinDatos(): void {
  mockUseLibroDiario.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
  });
}

// ============================================================
// R7 — card wrapper en el bloque de filtros
// ============================================================

describe('LibroDiarioPage — R7: card wrapper en filtros', () => {
  it('renderiza el bloque de filtros dentro de un card con las clases canónicas', () => {
    mockSinDatos();
    const { container } = render(<LibroDiarioPage />);

    // El card canónico (R7) es un div padre del componente de filtros.
    // Lo buscamos por el selector de clases compuesto que deben coincidir.
    const card = container.querySelector('.rounded-lg.border.bg-card.p-4');
    expect(card).not.toBeNull();

    // El componente de filtros debe estar contenido dentro del card.
    const filtros = screen.getByTestId('libro-diario-filtros');
    expect(card?.contains(filtros)).toBe(true);
  });

  it('renderiza el heading "Libro Diario" y el estado vacío inicial', () => {
    mockSinDatos();
    render(<LibroDiarioPage />);

    expect(screen.getByRole('heading', { name: 'Libro Diario' })).toBeInTheDocument();
    expect(
      screen.getByText(/seleccioná un período o rango de fechas/i),
    ).toBeInTheDocument();
  });
});

// ============================================================
// R9 — derivación del rango para export desde data.rango
// ============================================================

describe('LibroDiarioPage — R9: derivación del rango para export', () => {
  it('cuando el hook devuelve data, el rango viene de data.rango.fechaDesde y data.rango.fechaHasta', () => {
    mockBotonExportar.mockClear();
    mockUseLibroDiario.mockReturnValue({
      data: dataConPeriodo,
      isLoading: false,
      isError: false,
      isFetching: false,
    });

    render(<LibroDiarioPage />);

    expect(mockBotonExportar).toHaveBeenCalledWith(
      expect.objectContaining({ rango: '2026-04-01_2026-04-30' }),
    );
  });

  it('cuando data es undefined, el rango cae a "sin-rango" (no usa el UUID del período)', () => {
    mockBotonExportar.mockClear();
    mockSinDatos();

    render(<LibroDiarioPage />);

    expect(mockBotonExportar).toHaveBeenCalledWith(
      expect.objectContaining({ rango: 'sin-rango' }),
    );
  });

  it('el rango nunca contiene el UUID del periodoFiscalId (regresión R9)', () => {
    mockBotonExportar.mockClear();
    // Simula el estado DURANTE la carga: data aún undefined, pero la query está activa.
    mockUseLibroDiario.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: true,
    });

    render(<LibroDiarioPage />);

    const llamada = mockBotonExportar.mock.calls[0]?.[0] as { rango: string } | undefined;
    expect(llamada?.rango).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('muestra el heading "Libro Diario"', () => {
    mockSinDatos();

    render(<LibroDiarioPage />);
    expect(screen.getByRole('heading', { name: /libro diario/i })).toBeInTheDocument();
  });

  it('muestra el estado vacío inicial cuando no hay params activos', () => {
    mockSinDatos();

    render(<LibroDiarioPage />);
    expect(screen.getByText(/seleccioná un período/i)).toBeInTheDocument();
  });
});
