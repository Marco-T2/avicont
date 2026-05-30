import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Periodo } from '@/types/api';

import { ComprobantesFilters } from './comprobantes-filters';

// Mock del hook cross-feature de períodos para controlar las opciones del select.
const mockUsePeriodos = vi.fn();
vi.mock('@/features/periodos-fiscales/hooks/use-periodos', () => ({
  usePeriodos: (...args: unknown[]) => mockUsePeriodos(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
});

const PERIODOS: Periodo[] = [
  buildPeriodo({ id: 'p-2026-05', year: 2026, month: 5 }),
  buildPeriodo({ id: 'p-2026-04', year: 2026, month: 4 }),
];

function buildPeriodo(overrides: Partial<Periodo>): Periodo {
  return {
    id: 'p-1',
    gestionId: 'g-1',
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

// Captura el querystring actual para verificar la escritura en URL state.
function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

function renderFilters(initialSearch = '') {
  mockUsePeriodos.mockReturnValue({ data: PERIODOS, isLoading: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/${initialSearch}`]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <ComprobantesFilters />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ComprobantesFilters', () => {
  it('renderiza tipo, estado, período, búsqueda y toggle de anulados', () => {
    renderFilters();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
    expect(screen.getByLabelText('Período')).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar comprobante')).toBeInTheDocument();
    expect(screen.getByLabelText('Mostrar anulados')).toBeInTheDocument();
  });

  it('el toggle de anulados arranca en off por default', () => {
    renderFilters();
    const toggle = screen.getByRole('switch', { name: 'Mostrar anulados' });
    expect(toggle).not.toBeChecked();
  });

  it('escribir en la búsqueda actualiza el query param q (debounced)', async () => {
    const user = userEvent.setup();
    renderFilters();

    await user.type(screen.getByLabelText('Buscar comprobante'), 'compra');

    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toContain('q=compra');
    });
  });

  it('seeded desde la URL: el input refleja el q inicial', () => {
    renderFilters('?q=alquiler');
    expect(screen.getByLabelText('Buscar comprobante')).toHaveValue('alquiler');
  });

  it('muestra las opciones de período etiquetadas como "<Mes> <Año>"', async () => {
    const user = userEvent.setup();
    renderFilters();

    await user.click(screen.getByLabelText('Período'));

    expect(await screen.findByText('Mayo 2026')).toBeInTheDocument();
    expect(screen.getByText('Abril 2026')).toBeInTheDocument();
  });
});
