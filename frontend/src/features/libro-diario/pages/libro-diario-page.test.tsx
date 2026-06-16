import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mocks de hooks cross-feature requeridos por la página.
vi.mock('@/features/tenants/hooks/use-empresa', () => ({
  useEmpresa: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../hooks/use-libro-diario', () => ({
  useLibroDiario: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
  })),
}));

// El componente LibroDiarioFiltros tiene sus propios hooks internos; mockeamos el
// componente completo para aislar el test de la página.
vi.mock('../components/libro-diario-filtros', () => ({
  LibroDiarioFiltros: () => <div data-testid="libro-diario-filtros">Filtros</div>,
}));

vi.mock('../components/libro-diario-tabla', () => ({
  LibroDiarioTabla: () => <div data-testid="libro-diario-tabla">Tabla</div>,
}));

vi.mock('../components/boton-exportar-libro-diario', () => ({
  BotonExportarLibroDiario: () => <button>Exportar</button>,
}));

import { LibroDiarioPage } from './libro-diario-page';

// ============================================================
// R7 — card wrapper en el bloque de filtros
// ============================================================

describe('LibroDiarioPage — R7: card wrapper en filtros', () => {
  it('renderiza el bloque de filtros dentro de un card con las clases canónicas', () => {
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
    render(<LibroDiarioPage />);

    expect(screen.getByRole('heading', { name: 'Libro Diario' })).toBeInTheDocument();
    expect(
      screen.getByText(/seleccioná un período o rango de fechas/i),
    ).toBeInTheDocument();
  });
});
