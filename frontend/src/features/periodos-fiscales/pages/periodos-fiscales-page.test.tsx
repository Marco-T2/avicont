import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import type { Gestion, GestionConPeriodos } from '@/types/api';

import { useGestionDetalle } from '../hooks/use-gestion-detalle';
import { useGestiones } from '../hooks/use-gestiones';

import { PeriodosFiscalesPage } from './periodos-fiscales-page';

vi.mock('../hooks/use-gestiones', () => ({ useGestiones: vi.fn() }));
vi.mock('../hooks/use-gestion-detalle', () => ({ useGestionDetalle: vi.fn() }));
// El page no llama directamente useCerrarGestion / useCrearGestion / etc.,
// pero los componentes hijos sí. Como solo hacemos smoke test (render OK)
// los mockeamos como no-ops para evitar contaminación de cache de Query.
vi.mock('../hooks/use-cerrar-gestion', () => ({
  useCerrarGestion: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-cerrar-periodo', () => ({
  useCerrarPeriodo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-crear-gestion', () => ({
  useCrearGestion: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-reabrir-periodo', () => ({
  useReabrirPeriodo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-resumen-precierre', () => ({
  useResumenPrecierre: () => ({ data: undefined, isLoading: false, isError: false }),
}));

// Los botones de acción (Nueva gestión, Cerrar gestión, Cerrar período) usan
// PermissionButton → usePermissions. Smoke test: concedemos todo.
vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({ has: () => true, hasAll: () => true, isOwner: true, permissions: [] }),
}));

const mockedUseGestiones = useGestiones as unknown as ReturnType<typeof vi.fn>;
const mockedUseGestionDetalle = useGestionDetalle as unknown as ReturnType<typeof vi.fn>;

function wrap(node: React.ReactNode): React.JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const gestion2026: Gestion = {
  id: 'g1',
  year: 2026,
  mesInicio: 1,
  status: 'ABIERTA',
  closedAt: null,
  closedByUserId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const gestion2026Detalle: GestionConPeriodos = {
  ...gestion2026,
  fechaInicio: '2026-01-01',
  fechaFin: '2026-12-31',
  tipoEmpresaPrincipal: 'COMERCIAL',
  mesCierre: 12,
  periodos: Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`,
    gestionId: 'g1',
    year: 2026,
    month: i + 1,
    ordenEnGestion: i + 1,
    status: 'ABIERTO' as const,
    esDefinitivo: false,
    closedAt: null,
    closedByUserId: null,
    fechaInicio: `2026-${String(i + 1).padStart(2, '0')}-01`,
    fechaFin: `2026-${String(i + 1).padStart(2, '0')}-28`,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  })),
};

afterEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ accessToken: null, user: null });
});

describe('PeriodosFiscalesPage (smoke)', () => {
  it('muestra loading mientras carga la lista de gestiones', () => {
    mockedUseGestiones.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockedUseGestionDetalle.mockReturnValue({ data: undefined, isLoading: false });

    render(wrap(<PeriodosFiscalesPage />));

    expect(screen.getByRole('heading', { name: /períodos fiscales/i })).toBeInTheDocument();
    // Skeleton bars renderizados (1 + 1 dentro del PageSkeleton; basta con verificar que no hay tabla)
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra empty state cuando no hay gestiones', () => {
    mockedUseGestiones.mockReturnValue({ data: [], isLoading: false, isError: false });
    mockedUseGestionDetalle.mockReturnValue({ data: undefined, isLoading: false });

    render(wrap(<PeriodosFiscalesPage />));

    expect(screen.getByText(/no hay gestiones todavía/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /crear primera gestión/i }),
    ).toBeInTheDocument();
  });

  it('renderiza la tabla con los 12 períodos cuando hay datos', () => {
    mockedUseGestiones.mockReturnValue({
      data: [gestion2026],
      isLoading: false,
      isError: false,
    });
    mockedUseGestionDetalle.mockReturnValue({
      data: gestion2026Detalle,
      isLoading: false,
      isError: false,
    });

    render(wrap(<PeriodosFiscalesPage />));

    expect(screen.queryByText(/no hay gestiones todavía/i)).not.toBeInTheDocument();
    // PeriodosTable renderiza tabla desktop + card stack mobile (ambos a la vez en JSDOM).
    // Confirmamos que existe al menos una tabla.
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  });
});
