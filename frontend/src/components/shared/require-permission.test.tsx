import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as usePermissionsModule from '@/lib/use-permissions';

import { RequirePermission } from './require-permission';

function mockPermissions(overrides: {
  isOwner?: boolean;
  isLoading?: boolean;
  permissions?: string[];
}) {
  const { isOwner = false, isLoading = false, permissions = [] } = overrides;
  vi.spyOn(usePermissionsModule, 'usePermissions').mockReturnValue({
    isOwner,
    isLoading,
    permissions,
    has: (p: string) => {
      if (isLoading) return false;
      if (isOwner) return true;
      return permissions.includes(p);
    },
  } as unknown as ReturnType<typeof usePermissionsModule.usePermissions>);
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('<RequirePermission>', () => {
  it('con permiso renderiza children', () => {
    mockPermissions({ permissions: ['contabilidad.eeff.read'] });
    render(
      <Wrapper>
        <RequirePermission permission="contabilidad.eeff.read">
          <span>página protegida</span>
        </RequirePermission>
      </Wrapper>,
    );
    expect(screen.getByText('página protegida')).toBeInTheDocument();
  });

  it('sin permiso renderiza vista inline "No tenés permiso para ver esta página"', () => {
    mockPermissions({ permissions: [] });
    render(
      <Wrapper>
        <RequirePermission permission="contabilidad.eeff.read">
          <span>página protegida</span>
        </RequirePermission>
      </Wrapper>,
    );
    expect(screen.queryByText('página protegida')).not.toBeInTheDocument();
    expect(screen.getByText('No tenés permiso para ver esta página')).toBeInTheDocument();
  });

  it('la vista inline sin permiso contiene CTA Volver al inicio', () => {
    mockPermissions({ permissions: [] });
    render(
      <Wrapper>
        <RequirePermission permission="contabilidad.eeff.read">
          <span>página protegida</span>
        </RequirePermission>
      </Wrapper>,
    );
    expect(screen.getByText('Volver al inicio')).toBeInTheDocument();
  });

  it('con isOwner: true renderiza children independientemente del permiso', () => {
    mockPermissions({ isOwner: true, permissions: [] });
    render(
      <Wrapper>
        <RequirePermission permission="contabilidad.eeff.read">
          <span>página propietario</span>
        </RequirePermission>
      </Wrapper>,
    );
    expect(screen.getByText('página propietario')).toBeInTheDocument();
  });

  it('en loading NO renderiza children NI vista de error (muestra skeleton/spinner)', () => {
    mockPermissions({ isLoading: true });
    render(
      <Wrapper>
        <RequirePermission permission="contabilidad.eeff.read">
          <span>página protegida</span>
        </RequirePermission>
      </Wrapper>,
    );
    expect(screen.queryByText('página protegida')).not.toBeInTheDocument();
    expect(screen.queryByText('No tenés permiso para ver esta página')).not.toBeInTheDocument();
    // El skeleton está presente (data-slot="skeleton" del componente Skeleton de shadcn)
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });
});
