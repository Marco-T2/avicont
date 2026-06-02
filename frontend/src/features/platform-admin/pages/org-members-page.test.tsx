import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformOrgMember } from '@/types/api';

import { OrgMembersPage } from './org-members-page';

vi.mock('../hooks/use-org-members', () => ({
  useOrgMembers: vi.fn(),
}));

// Router param mock
vi.mock('react-router-dom', () => ({
  useParams: vi.fn(() => ({ id: 'org-1' })),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { useOrgMembers } from '../hooks/use-org-members';

const members: PlatformOrgMember[] = [
  {
    id: 'mem-1',
    userId: 'user-1',
    systemRole: 'OWNER',
    customRoleId: null,
    customRole: null,
    deactivatedAt: null,
    createdAt: '2026-01-15T10:00:00Z',
    user: { id: 'user-1', email: 'owner@test.com', displayName: 'Juan Pérez' },
  },
  {
    id: 'mem-2',
    userId: 'user-2',
    systemRole: 'ADMIN',
    customRoleId: null,
    customRole: null,
    deactivatedAt: '2026-03-01T00:00:00Z',
    createdAt: '2026-02-01T10:00:00Z',
    user: { id: 'user-2', email: 'admin@test.com', displayName: null },
  },
  {
    id: 'mem-3',
    userId: 'user-3',
    systemRole: null,
    customRoleId: 'role-1',
    customRole: { id: 'role-1', slug: 'contador', name: 'Contador' },
    deactivatedAt: null,
    createdAt: '2026-02-20T10:00:00Z',
    user: { id: 'user-3', email: 'contador@test.com', displayName: 'María García' },
  },
];

function mockUseOrgMembers(value: Partial<ReturnType<typeof useOrgMembers>>): void {
  vi.mocked(useOrgMembers).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...value,
  } as ReturnType<typeof useOrgMembers>);
}

describe('OrgMembersPage', () => {
  beforeEach(() => {
    vi.mocked(useOrgMembers).mockReset();
  });

  it('renderiza tabla con una fila por miembro (email, systemRole, estado, createdAt)', () => {
    mockUseOrgMembers({ data: members });
    render(<OrgMembersPage />);

    // Emails visibles en tabla
    expect(screen.getByText('owner@test.com')).toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    expect(screen.getByText('contador@test.com')).toBeInTheDocument();

    // displayName cuando existe
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('María García')).toBeInTheDocument();

    // Roles
    expect(screen.getByText('OWNER')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    // Custom role name
    expect(screen.getByText('Contador')).toBeInTheDocument();
  });

  it('el miembro desactivado se distingue visualmente (badge o texto de estado)', () => {
    mockUseOrgMembers({ data: members });
    render(<OrgMembersPage />);

    // Debe mostrar que el miembro con deactivatedAt no nulo está desactivado
    expect(screen.getByText('Desactivado')).toBeInTheDocument();
    // Y los activos muestran "Activo"
    const activos = screen.getAllByText('Activo');
    expect(activos.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra skeleton mientras carga', () => {
    mockUseOrgMembers({ isLoading: true });
    const { container } = render(<OrgMembersPage />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('owner@test.com')).not.toBeInTheDocument();
  });

  it('muestra empty state "No hay miembros" cuando el array está vacío', () => {
    mockUseOrgMembers({ data: [] });
    render(<OrgMembersPage />);

    expect(screen.getByText('No hay miembros')).toBeInTheDocument();
  });

  it('muestra mensaje de error en español ante fallo', () => {
    mockUseOrgMembers({ isError: true });
    render(<OrgMembersPage />);

    expect(screen.getByText(/No se pudieron cargar los miembros/i)).toBeInTheDocument();
  });
});
