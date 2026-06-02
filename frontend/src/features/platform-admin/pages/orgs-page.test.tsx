import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformOrg } from '@/types/api';

import { OrgsPage } from './orgs-page';

function renderOrgsPage() {
  return render(
    <MemoryRouter>
      <OrgsPage />
    </MemoryRouter>,
  );
}

vi.mock('../hooks/use-orgs', () => ({
  useOrgs: vi.fn(),
}));

vi.mock('../hooks/use-create-org', () => ({
  useCreateOrg: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../hooks/use-update-org-status', () => ({
  useUpdateOrgStatus: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../hooks/use-update-entitlement', () => ({
  useUpdateEntitlement: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { useOrgs } from '../hooks/use-orgs';

const orgs: PlatformOrg[] = [
  {
    id: 'org-1',
    name: 'Avícola del Valle',
    slug: 'avicola-del-valle',
    status: 'ACTIVE',
    plan: 'PRO',
    contabilidadEnabled: true,
    granjaEnabled: false,
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'org-2',
    name: 'Granja San José',
    slug: 'granja-san-jose',
    status: 'SUSPENDED',
    plan: 'FREE',
    contabilidadEnabled: false,
    granjaEnabled: true,
    createdAt: '2026-02-20T10:00:00Z',
  },
];

function mockUseOrgs(value: Partial<ReturnType<typeof useOrgs>>): void {
  vi.mocked(useOrgs).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...value,
  } as ReturnType<typeof useOrgs>);
}

describe('OrgsPage', () => {
  beforeEach(() => {
    vi.mocked(useOrgs).mockReset();
  });

  it('renderiza una fila por organización con sus badges', () => {
    mockUseOrgs({ data: orgs });
    renderOrgsPage();

    expect(screen.getByText('Avícola del Valle')).toBeInTheDocument();
    expect(screen.getByText('Granja San José')).toBeInTheDocument();
    // Badges de status y plan (etiquetas en español).
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Suspendida')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('muestra skeleton mientras carga', () => {
    mockUseOrgs({ isLoading: true });
    const { container } = renderOrgsPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Avícola del Valle')).not.toBeInTheDocument();
  });

  it('muestra el empty state cuando no hay organizaciones', () => {
    mockUseOrgs({ data: [] });
    renderOrgsPage();

    expect(screen.getByText('No hay organizaciones')).toBeInTheDocument();
  });

  it('muestra un mensaje de error en español ante un fallo', () => {
    mockUseOrgs({ isError: true });
    renderOrgsPage();

    expect(
      screen.getByText('No se pudieron cargar las organizaciones.'),
    ).toBeInTheDocument();
  });

  it('el botón "Nueva organización" abre el sheet de creación', async () => {
    mockUseOrgs({ data: orgs });
    const user = userEvent.setup();
    renderOrgsPage();

    // El sheet arranca cerrado: su título no está montado.
    expect(screen.queryByText('Nueva organización', { selector: 'h2' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /nueva organización/i }));

    await waitFor(() => {
      expect(screen.getByText('Email del responsable')).toBeInTheDocument();
    });
  });

  it('el menú de acciones de una org ACTIVE ofrece suspender, archivar y editar entitlement', async () => {
    mockUseOrgs({ data: orgs });
    const user = userEvent.setup();
    renderOrgsPage();

    await user.click(screen.getByRole('button', { name: /acciones para avícola del valle/i }));

    expect(
      await screen.findByRole('menuitem', { name: /editar entitlement/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /suspender/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /archivar/i })).toBeInTheDocument();
  });

  it('el menú de acciones de una org SUSPENDED ofrece reactivar', async () => {
    mockUseOrgs({ data: orgs });
    const user = userEvent.setup();
    renderOrgsPage();

    await user.click(screen.getByRole('button', { name: /acciones para granja san josé/i }));

    expect(
      await screen.findByRole('menuitem', { name: /reactivar/i }),
    ).toBeInTheDocument();
  });

  it('al elegir "Editar entitlement" abre el sheet de entitlement', async () => {
    mockUseOrgs({ data: orgs });
    const user = userEvent.setup();
    renderOrgsPage();

    await user.click(screen.getByRole('button', { name: /acciones para avícola del valle/i }));
    await user.click(await screen.findByRole('menuitem', { name: /editar entitlement/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument();
    });
  });

  it('al elegir "Suspender" abre el dialog de confirmación de estado', async () => {
    mockUseOrgs({ data: orgs });
    const user = userEvent.setup();
    renderOrgsPage();

    await user.click(screen.getByRole('button', { name: /acciones para avícola del valle/i }));
    await user.click(await screen.findByRole('menuitem', { name: /suspender/i }));

    await waitFor(() => {
      expect(screen.getByText('¿Suspender esta organización?')).toBeInTheDocument();
    });
  });
});
