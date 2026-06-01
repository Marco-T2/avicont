import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as usePermissionsModule from '@/lib/use-permissions';
import * as useVerticalModule from '@/lib/use-vertical';
import type { VerticalActivo } from '@/types/api';

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

function mockVertical(v: VerticalActivo | undefined) {
  vi.spyOn(useVerticalModule, 'useVerticalActivo').mockReturnValue({
    vertical: v,
    isLoading: v === undefined,
  });
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
  // Estos tests preexistentes cubren solo el filtro por permiso.
  // Para que los ítems de contabilidad sean visibles (tienen vertical: 'CONTABILIDAD'),
  // mockeamos el vertical como CONTABILIDAD por defecto en este describe.
  beforeEach(() => {
    mockVertical('CONTABILIDAD');
  });

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

  it('todo ítem con permiso de namespace contabilidad.* o granja.* declara vertical', () => {
    for (const item of NAV_ITEMS) {
      if (item.disabled === true) continue;
      const perm = item.requiredPermission;
      if (!perm) continue;
      if (perm.startsWith('contabilidad.') || perm.startsWith('granja.')) {
        expect(
          item.vertical,
          `"${item.label}" (${item.to}) tiene permiso ${perm} y debe declarar vertical`,
        ).toBeDefined();
      }
    }
  });

  it('ningún ítem de namespace organizacion.* ni la ruta "/" declara vertical', () => {
    for (const item of NAV_ITEMS) {
      const perm = item.requiredPermission;
      if (item.to === '/' || (perm && perm.startsWith('organizacion.'))) {
        expect(
          item.vertical,
          `"${item.label}" (${item.to}) es cross-vertical y NO debe declarar vertical`,
        ).toBeUndefined();
      }
    }
  });
});

describe('NavList — filtrado por vertical', () => {
  // Para los tests de vertical, isOwner=true para que pasen todos los permisos
  // y podamos aislar solo el filtro por vertical.
  beforeEach(() => {
    mockPermissions({ isOwner: true });
  });

  it('vertical GRANJA: muestra ítems granja y administración; oculta contabilidad', () => {
    mockVertical('GRANJA');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // Granja visible
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mis Lotes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tipos de Registro').length).toBeGreaterThan(0);
    // Administración visible
    expect(screen.getAllByText('Miembros').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Roles').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Módulos activos').length).toBeGreaterThan(0);
    // Panel (sin vertical) visible
    expect(screen.getAllByText('Panel').length).toBeGreaterThan(0);
    // Contabilidad oculta
    expect(screen.queryByText('Balance General')).not.toBeInTheDocument();
    expect(screen.queryByText('Plan de cuentas')).not.toBeInTheDocument();
    expect(screen.queryByText('Comprobantes')).not.toBeInTheDocument();
    expect(screen.queryByText('Libro Diario')).not.toBeInTheDocument();
  });

  it('vertical GRANJA: NO muestra "Configuración contable" (disabled + vertical CONTABILIDAD)', () => {
    mockVertical('GRANJA');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // El ítem disabled tiene vertical: 'CONTABILIDAD' → no debe aparecer para el granjero
    expect(screen.queryByText('Configuración contable')).not.toBeInTheDocument();
  });

  it('vertical CONTABILIDAD: muestra ítems contabilidad y administración; oculta granja', () => {
    mockVertical('CONTABILIDAD');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // Contabilidad visible
    expect(screen.getAllByText('Balance General').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Plan de cuentas').length).toBeGreaterThan(0);
    // Administración visible
    expect(screen.getAllByText('Miembros').length).toBeGreaterThan(0);
    // Granja oculta
    expect(screen.queryByText('Mis Lotes')).not.toBeInTheDocument();
    expect(screen.queryByText('Tipos de Registro')).not.toBeInTheDocument();
  });

  it('vertical undefined (cargando): oculta toda operación; Panel y administración con permiso visibles', () => {
    mockVertical(undefined);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // Panel sin vertical — siempre visible
    expect(screen.getAllByText('Panel').length).toBeGreaterThan(0);
    // Administración (sin vertical) visible cuando hay permiso
    expect(screen.getAllByText('Miembros').length).toBeGreaterThan(0);
    // Operación con vertical oculta
    expect(screen.queryByText('Balance General')).not.toBeInTheDocument();
    expect(screen.queryByText('Mis Lotes')).not.toBeInTheDocument();
  });

  it('vertical null (org sin módulo): oculta toda operación; administración con permiso sigue visible', () => {
    mockVertical(null);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Panel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Miembros').length).toBeGreaterThan(0);
    expect(screen.queryByText('Balance General')).not.toBeInTheDocument();
    expect(screen.queryByText('Mis Lotes')).not.toBeInTheDocument();
  });

  it('ítems organizacion.* visibles en AMBOS verticales cuando hay permiso', () => {
    const adminPerms = [
      'organizacion.miembros.read',
      'organizacion.roles.read',
      'organizacion.feature-flags.read',
    ];
    mockPermissions({ allowedPermissions: adminPerms });

    mockVertical('CONTABILIDAD');
    const { unmount } = render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Miembros').length).toBeGreaterThan(0);
    unmount();

    mockVertical('GRANJA');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Miembros').length).toBeGreaterThan(0);
  });

  it('defensa en profundidad: GRANJA + permiso contabilidad.eeff.read → Balance General igual NO aparece', () => {
    mockPermissions({ allowedPermissions: ['contabilidad.eeff.read'] });
    mockVertical('GRANJA');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Balance General')).not.toBeInTheDocument();
  });
});
