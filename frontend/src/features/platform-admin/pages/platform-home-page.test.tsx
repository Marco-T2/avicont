import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformActivity, PlatformDashboard } from '@/types/api';

import { PlatformHomePage } from './platform-home-page';

// Mocks de los dos hooks que orquesta la página.
vi.mock('../hooks/use-platform-dashboard', () => ({
  usePlatformDashboard: vi.fn(),
}));

vi.mock('../hooks/use-platform-activity', () => ({
  usePlatformActivity: vi.fn(),
}));

import { usePlatformActivity } from '../hooks/use-platform-activity';
import { usePlatformDashboard } from '../hooks/use-platform-dashboard';

// Helpers para controlar el estado de los hooks desde tests.
type DashboardHookResult = Partial<ReturnType<typeof usePlatformDashboard>>;
type ActivityHookResult = Partial<ReturnType<typeof usePlatformActivity>>;

function mockDashboard(partial: DashboardHookResult): void {
  vi.mocked(usePlatformDashboard).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: false,
    status: 'pending',
    ...partial,
  } as ReturnType<typeof usePlatformDashboard>);
}

function mockActivity(partial: ActivityHookResult): void {
  vi.mocked(usePlatformActivity).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: false,
    status: 'pending',
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...partial,
  } as unknown as ReturnType<typeof usePlatformActivity>);
}

const DASHBOARD_DATA: PlatformDashboard = {
  orgsPorStatus: [
    { category: 'ACTIVE', count: 5 },
    { category: 'SUSPENDED', count: 1 },
    { category: 'ARCHIVED', count: 0 },
  ],
  orgsPorPlan: [
    { category: 'FREE', count: 4 },
    { category: 'PRO', count: 2 },
  ],
  orgsPorVertical: [
    { category: 'contabilidad', count: 3 },
    { category: 'granja', count: 2 },
  ],
  usuarios: { total: 20 },
  altasPorMes: [
    { year: 2026, month: 5, count: 3 },
    { year: 2026, month: 6, count: 2 },
  ],
};

// displayName tiene tipo `Record<string, never> | null` en el generado (gotcha
// openapi-typescript cuando el backend declara el campo como `type: "object"` nullable).
const ACTIVITY_PAGE: PlatformActivity = {
  items: [
    {
      id: 'a-1',
      action: 'platform.org.create',
      actorUserId: 'sa-1',
      actor: { email: 'sa@plataforma.com', displayName: 'Super Admin' as never },
      targetOrganizationId: 'org-1' as never,
      targetOrganization: { name: 'Org Demo' },
      createdAt: '2026-06-01T10:00:00Z',
    },
  ],
  nextCursor: null,
};

describe('PlatformHomePage', () => {
  beforeEach(() => {
    vi.mocked(usePlatformDashboard).mockReset();
    vi.mocked(usePlatformActivity).mockReset();
  });

  it('muestra el header canónico de la página', () => {
    mockDashboard({ isLoading: true });
    mockActivity({ isLoading: true });

    render(<PlatformHomePage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Panel de plataforma');
  });

  it('muestra skeletons mientras cargan los datos del dashboard', () => {
    mockDashboard({ isLoading: true });
    mockActivity({ isLoading: false });

    const { container } = render(<PlatformHomePage />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('muestra skeletons mientras carga la actividad', () => {
    mockDashboard({ isLoading: false });
    mockActivity({ isLoading: true });

    const { container } = render(<PlatformHomePage />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('muestra los KPIs cuando el dashboard cargó', () => {
    mockDashboard({ data: DASHBOARD_DATA, isLoading: false });
    mockActivity({ isLoading: false });

    render(<PlatformHomePage />);

    expect(screen.getByText('Organizaciones')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument(); // usuarios
  });

  it('muestra el gráfico de altas cuando los datos están disponibles', () => {
    mockDashboard({ data: DASHBOARD_DATA, isLoading: false });
    mockActivity({ isLoading: false });

    render(<PlatformHomePage />);

    expect(screen.getByText('Altas de organizaciones — últimos 12 meses')).toBeInTheDocument();
  });

  it('muestra el timeline de actividad cuando los datos cargaron', () => {
    mockDashboard({ isLoading: false });
    mockActivity({
      data: { pages: [ACTIVITY_PAGE], pageParams: [undefined] },
      isLoading: false,
    });

    render(<PlatformHomePage />);

    expect(screen.getByText('platform.org.create')).toBeInTheDocument();
    expect(screen.getByText('Org Demo')).toBeInTheDocument();
  });

  it('muestra un banner de error del dashboard en español', () => {
    mockDashboard({ isError: true, isLoading: false });
    mockActivity({ isLoading: false });

    render(<PlatformHomePage />);

    expect(
      screen.getByText('No se pudieron cargar los KPIs del dashboard.'),
    ).toBeInTheDocument();
  });

  it('muestra un banner de error de actividad en español', () => {
    mockDashboard({ isLoading: false });
    mockActivity({ isError: true, isLoading: false });

    render(<PlatformHomePage />);

    expect(
      screen.getByText('No se pudo cargar la actividad reciente.'),
    ).toBeInTheDocument();
  });

  it('muestra el empty state de actividad cuando no hay items', () => {
    mockDashboard({ isLoading: false });
    mockActivity({
      data: { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] },
      isLoading: false,
      hasNextPage: false,
    });

    render(<PlatformHomePage />);

    expect(screen.getByText('Sin actividad registrada.')).toBeInTheDocument();
  });
});
