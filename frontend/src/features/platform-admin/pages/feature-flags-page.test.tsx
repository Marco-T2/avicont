import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlag } from '@/types/api';

import { FeatureFlagsPage } from './feature-flags-page';

vi.mock('../hooks/use-feature-flags', () => ({
  useFeatureFlags: vi.fn(),
}));

const toggleMutate = vi.fn();
vi.mock('../hooks/use-toggle-feature-flag', () => ({
  useToggleFeatureFlag: vi.fn(() => ({ mutate: toggleMutate, isPending: false })),
}));

vi.mock('../hooks/use-create-feature-flag', () => ({
  useCreateFeatureFlag: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../hooks/use-update-feature-flag', () => ({
  useUpdateFeatureFlag: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../hooks/use-delete-feature-flag', () => ({
  useDeleteFeatureFlag: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { useFeatureFlags } from '../hooks/use-feature-flags';

const flags: FeatureFlag[] = [
  {
    id: 'ff-1',
    key: 'new_dashboard',
    name: 'New Dashboard',
    description: 'Experiencia nueva',
    enabled: true,
    organizationId: null,
    metadata: null,
    createdAt: '2026-06-02T10:00:00Z',
    updatedAt: '2026-06-02T10:00:00Z',
  },
  {
    id: 'ff-2',
    key: 'beta_reports',
    name: 'Beta Reports',
    description: null,
    enabled: false,
    organizationId: null,
    metadata: null,
    createdAt: '2026-06-02T10:00:00Z',
    updatedAt: '2026-06-02T10:00:00Z',
  },
];

function mockUseFeatureFlags(value: Partial<ReturnType<typeof useFeatureFlags>>): void {
  vi.mocked(useFeatureFlags).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...value,
  } as ReturnType<typeof useFeatureFlags>);
}

describe('FeatureFlagsPage', () => {
  beforeEach(() => {
    vi.mocked(useFeatureFlags).mockReset();
    toggleMutate.mockReset();
  });

  it('renderiza una fila por feature flag con su clave y nombre', () => {
    mockUseFeatureFlags({ data: flags });
    render(<FeatureFlagsPage />);

    expect(screen.getByText('new_dashboard')).toBeInTheDocument();
    expect(screen.getByText('New Dashboard')).toBeInTheDocument();
    expect(screen.getByText('beta_reports')).toBeInTheDocument();
    expect(screen.getByText('Beta Reports')).toBeInTheDocument();
  });

  it('muestra skeleton mientras carga', () => {
    mockUseFeatureFlags({ isLoading: true });
    const { container } = render(<FeatureFlagsPage />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('new_dashboard')).not.toBeInTheDocument();
  });

  it('muestra el empty state cuando no hay feature flags', () => {
    mockUseFeatureFlags({ data: [] });
    render(<FeatureFlagsPage />);

    expect(screen.getByText('No hay feature flags')).toBeInTheDocument();
  });

  it('muestra un mensaje de error en español ante un fallo', () => {
    mockUseFeatureFlags({ isError: true });
    render(<FeatureFlagsPage />);

    expect(
      screen.getByText('No se pudieron cargar las feature flags.'),
    ).toBeInTheDocument();
  });

  it('al accionar el switch de una fila llama al toggle con su clave', async () => {
    mockUseFeatureFlags({ data: flags });
    const user = userEvent.setup();
    render(<FeatureFlagsPage />);

    await user.click(screen.getByRole('switch', { name: /new_dashboard/i }));

    expect(toggleMutate).toHaveBeenCalledTimes(1);
    expect(toggleMutate).toHaveBeenCalledWith('new_dashboard');
  });

  it('el botón "Nueva feature flag" abre el sheet de creación', async () => {
    mockUseFeatureFlags({ data: flags });
    const user = userEvent.setup();
    render(<FeatureFlagsPage />);

    await user.click(screen.getByRole('button', { name: /nueva feature flag/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /crear feature flag/i })).toBeInTheDocument();
    });
  });

  it('al elegir "Editar" en una fila abre el sheet en modo edición', async () => {
    mockUseFeatureFlags({ data: flags });
    const user = userEvent.setup();
    render(<FeatureFlagsPage />);

    await user.click(screen.getByRole('button', { name: /acciones para new_dashboard/i }));
    await user.click(await screen.findByRole('menuitem', { name: /editar/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
    });
  });

  it('al elegir "Eliminar" en una fila abre el dialog de confirmación', async () => {
    mockUseFeatureFlags({ data: flags });
    const user = userEvent.setup();
    render(<FeatureFlagsPage />);

    await user.click(screen.getByRole('button', { name: /acciones para new_dashboard/i }));
    await user.click(await screen.findByRole('menuitem', { name: /eliminar/i }));

    await waitFor(() => {
      expect(screen.getByText('¿Eliminar esta feature flag?')).toBeInTheDocument();
    });
  });
});
