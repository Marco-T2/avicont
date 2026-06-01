import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as usePermissionsModule from '@/lib/use-permissions';

import { NAV_ITEMS } from './nav-items';
import { NavList } from './nav-list';

function mockPermissions(overrides: {
  isOwner?: boolean;
  isLoading?: boolean;
  allowedPermissions?: string[];
}) {
  const { isOwner = false, isLoading = false, allowedPermissions = [] } = overrides;
  vi.spyOn(usePermissionsModule, 'usePermissions').mockReturnValue({
    isOwner,
    isLoading,
    permissions: allowedPermissions,
    has: (p: string) => {
      if (isLoading) return false;
      if (isOwner) return true;
      return allowedPermissions.includes(p);
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

afterEach(() => {
  vi.clearAllMocks();
});

describe('NavList — filtrado por requiredPermission', () => {
  it('ítems sin requiredPermission son siempre visibles', () => {
    mockPermissions({ allowedPermissions: [] });
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // Panel siempre visible (sin requiredPermission)
    expect(screen.getAllByText('Panel').length).toBeGreaterThan(0);
  });

  it('ítem con requiredPermission y has()=false NO se renderiza', () => {
    mockPermissions({ allowedPermissions: [] }); // sin permisos
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Balance General')).not.toBeInTheDocument();
  });

  it('ítem con requiredPermission y has()=true SÍ se renderiza', () => {
    mockPermissions({ allowedPermissions: ['contabilidad.eeff.read'] });
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Balance General').length).toBeGreaterThan(0);
  });

  it('con isOwner: true todos los ítems con requiredPermission son visibles', () => {
    mockPermissions({ isOwner: true });
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Balance General').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Libro Diario').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Libro Mayor').length).toBeGreaterThan(0);
  });

  it('en loading (isLoading: true) los ítems con requiredPermission NO se muestran', () => {
    mockPermissions({ isLoading: true });
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Balance General')).not.toBeInTheDocument();
    expect(screen.queryByText('Libro Diario')).not.toBeInTheDocument();
  });

  it('sin permisos, todo el menú de dominio queda gateado (solo Panel visible)', () => {
    mockPermissions({ allowedPermissions: [] });
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Panel').length).toBeGreaterThan(0);
    for (const label of [
      'Plan de cuentas',
      'Comprobantes',
      'Contactos',
      'Tipos de documento',
      'Documentos físicos',
      'Períodos fiscales',
      'Miembros',
      'Roles',
      'Módulos activos',
    ]) {
      expect(screen.queryByText(label), `${label} debería estar gateado`).not.toBeInTheDocument();
    }
  });
});

// Guard anti-drift: un ítem de nav nuevo sin permiso queda visible para todos sin
// que nadie lo note. Este test obliga a declarar requiredPermission salvo en los
// ítems públicos (Panel) o deshabilitados.
describe('NAV_ITEMS — cobertura de gating', () => {
  const RUTAS_PUBLICAS = new Set(['/']);

  it('todo ítem no-público y no-disabled declara requiredPermission', () => {
    for (const item of NAV_ITEMS) {
      if (RUTAS_PUBLICAS.has(item.to) || item.disabled === true) continue;
      expect(
        item.requiredPermission,
        `"${item.label}" (${item.to}) debe declarar requiredPermission`,
      ).toBeDefined();
    }
  });
});
