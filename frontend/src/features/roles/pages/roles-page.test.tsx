import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CustomRole } from '@/types/api';

import { RolesPage } from './roles-page';

// El catálogo de permisos y las mutaciones se mockean: acá se prueba la
// NAVEGACIÓN master-detail, no el form ni el picker (que tienen sus tests).
vi.mock('../hooks/use-permissions', () => ({
  usePermissionsGrouped: () => ({ data: [], isLoading: false }),
}));

const { rolesMock } = vi.hoisted(() => ({ rolesMock: vi.fn() }));
vi.mock('../hooks/use-roles', () => ({
  useRoles: () => rolesMock(),
  useCreateRole: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRole: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRole: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: () => true,
    hasAll: () => true,
    isOwner: true,
    permissions: [],
  }),
}));

const rol = (over: Partial<CustomRole> = {}): CustomRole => ({
  id: 'r-1',
  organizationId: 'org-1',
  slug: 'contador-junior',
  name: 'Contador Junior',
  description: null,
  permissions: ['contabilidad.asientos.read'],
  isSystemDefault: false,
  isEditable: true,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  createdById: 'u-1',
  ...over,
});

beforeEach(() => {
  rolesMock.mockReturnValue({
    data: [rol(), rol({ id: 'r-2', name: 'Auditor', slug: 'auditor' })],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

function montar(ruta: string): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/settings/roles" element={<RolesPage />} />
          <Route path="/settings/roles/nuevo" element={<RolesPage />} />
          <Route path="/settings/roles/:id" element={<RolesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RolesPage — master-detail', () => {
  it('sin selección invita a elegir, y no muestra el form', () => {
    montar('/settings/roles');

    expect(screen.getByText(/Elegí un rol de la lista/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre visible')).not.toBeInTheDocument();
  });

  it('elegir un rol de la lista abre su detalle con los datos cargados', async () => {
    montar('/settings/roles');

    await userEvent.click(screen.getByRole('button', { name: /Contador Junior/ }));

    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Contador Junior');
    // El slug es inmutable después de crear.
    expect(screen.getByLabelText('Identificador (slug)')).toBeDisabled();
  });

  it('entrar por URL directa a un rol lo abre sin pasar por la lista', () => {
    montar('/settings/roles/r-2');

    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Auditor');
  });

  it('la ruta de alta deja el form vacío y el slug editable', () => {
    montar('/settings/roles/nuevo');

    expect(screen.getByLabelText('Nombre visible')).toHaveValue('');
    expect(screen.getByLabelText('Identificador (slug)')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Crear rol' })).toBeInTheDocument();
  });

  it('un id que no existe se dice, en vez de mostrar un form vacío que pisaría el rol', () => {
    montar('/settings/roles/no-existe');

    expect(screen.getByText(/No encontramos el rol/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre visible')).not.toBeInTheDocument();
  });

  it('un rol no editable (plantilla) se muestra en lectura, no se esconde', () => {
    rolesMock.mockReturnValue({
      data: [rol({ isEditable: false, isSystemDefault: true })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    montar('/settings/roles/r-1');

    expect(screen.getByLabelText('Nombre visible')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('el error de carga es un banner con reintento, NO un toast por render (Anti-F-13)', () => {
    const refetch = vi.fn();
    rolesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    montar('/settings/roles');

    expect(screen.getByText(/No se pudieron cargar los roles/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
