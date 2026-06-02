import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformOrg } from '@/types/api';

import { OrgsPage } from './orgs-page';

vi.mock('../hooks/use-orgs', () => ({
  useOrgs: vi.fn(),
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
    render(<OrgsPage />);

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
    const { container } = render(<OrgsPage />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Avícola del Valle')).not.toBeInTheDocument();
  });

  it('muestra el empty state cuando no hay organizaciones', () => {
    mockUseOrgs({ data: [] });
    render(<OrgsPage />);

    expect(screen.getByText('No hay organizaciones')).toBeInTheDocument();
  });

  it('muestra un mensaje de error en español ante un fallo', () => {
    mockUseOrgs({ isError: true });
    render(<OrgsPage />);

    expect(
      screen.getByText('No se pudieron cargar las organizaciones.'),
    ).toBeInTheDocument();
  });
});
