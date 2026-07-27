import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as usePermissionsModule from '@/lib/use-permissions';
import * as usePacksModule from '@/lib/use-packs';
import * as useVerticalModule from '@/lib/use-vertical';
import { useAuthStore } from '@/stores/auth-store';
import { useSidebarStore } from '@/stores/sidebar-store';
import type { VerticalActivo } from '@/types/api';
import { TooltipProvider } from '@/components/ui/tooltip';

import * as navItemsModule from './nav-items';
import { NAV_ITEMS, NAV_SECTIONS, PANEL_ITEM, type NavItem } from './nav-items';
import { NavList } from './nav-list';

/** Ítems de una sección en orden de render: sueltos → grupos → sueltos finales. */
function itemsDeSeccion(id: string): NavItem[] {
  const s = NAV_SECTIONS.find((x) => x.id === id);
  if (!s) return [];
  return [...s.items, ...(s.groups ?? []).flatMap((g) => g.items), ...(s.trailingItems ?? [])];
}

function grupo(seccionId: string, grupoId: string) {
  return NAV_SECTIONS.find((s) => s.id === seccionId)?.groups?.find((g) => g.id === grupoId);
}

/**
 * Abre TODOS los subgrupos. Los tests de gating (permiso/vertical/pack/rol) no
 * deben depender del estado de plegado — expanden todo y miden solo el filtro.
 */
function expandAllGroups(): void {
  const ids = NAV_SECTIONS.flatMap((s) => (s.groups ?? []).map((g) => g.id));
  act(() => {
    useSidebarStore.setState({ openGroups: Object.fromEntries(ids.map((id) => [id, true])) });
  });
}

/** Deja todos los subgrupos plegados — el estado de un usuario que recién entra. */
function collapseAllGroups(): void {
  act(() => {
    useSidebarStore.setState({ openGroups: {} });
  });
}

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

function mockPacks(packsActivos: string[] | undefined) {
  vi.spyOn(usePacksModule, 'useMisPacks').mockReturnValue({
    packsActivos,
    isLoading: packsActivos === undefined,
  });
}

/** Pone roles en el auth store directamente (para testear el filtro SystemRole). */
function setAuthRoles(roles: string[] | undefined) {
  act(() => {
    useAuthStore.setState({
      user: roles !== undefined
        ? { id: 'u1', email: 'test@test.com', roles }
        : null,
    });
  });
}

function Wrapper({
  children,
  initialEntries = ['/'],
}: {
  children: React.ReactNode;
  initialEntries?: string[];
}) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={0}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// T-01, T-02, T-03 — NAV_SECTIONS: estructura de datos (RED → GREEN en T-05/T-06)
// ─────────────────────────────────────────────────────────────────────────────
describe('NAV_SECTIONS — estructura de datos', () => {
  // T-01: estructura básica
  it('NAV_SECTIONS tiene exactamente 4 secciones con los ids correctos en orden', () => {
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual([
      'contabilidad',
      'granja',
      'administracion',
      'configuracion',
    ]);
  });

  it('cada sección tiene id, label, kind e items', () => {
    for (const s of NAV_SECTIONS) {
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('label');
      expect(s).toHaveProperty('kind');
      expect(s).toHaveProperty('items');
      expect(Array.isArray(s.items)).toBe(true);
    }
  });

  it('kind de contabilidad y granja es "modulo"; administracion y configuracion es "transversal"', () => {
    const byId = Object.fromEntries(NAV_SECTIONS.map((s) => [s.id, s]));
    expect(byId['contabilidad']?.kind).toBe('modulo');
    expect(byId['granja']?.kind).toBe('modulo');
    expect(byId['administracion']?.kind).toBe('transversal');
    expect(byId['configuracion']?.kind).toBe('transversal');
  });

  it('PANEL_ITEM.to === "/"', () => {
    expect(PANEL_ITEM.to).toBe('/');
  });

  it('NAV_ITEMS derivado === [PANEL_ITEM, ...sueltos, ...grupos, ...sueltos finales]', () => {
    const expected = [
      PANEL_ITEM,
      ...NAV_SECTIONS.flatMap((s) => [
        ...s.items,
        ...(s.groups ?? []).flatMap((g) => g.items),
        ...(s.trailingItems ?? []),
      ]),
    ];
    expect(NAV_ITEMS).toEqual(expected);
  });

  // T-02: orden interno de Contabilidad (sueltos → grupos → sueltos finales)
  it('sección contabilidad tiene los ítems en el orden correcto', () => {
    expect(itemsDeSeccion('contabilidad').map((i) => i.to)).toEqual([
      '/comprobantes',
      '/libros/diario',
      '/libros/mayor',
      '/eeff/balance',
      '/eeff/balance-comprobacion',
      '/eeff/hoja-trabajo',
      '/eeff/resultados',
      '/eeff/evolucion-patrimonio',
      '/eeff/flujo-efectivo',
      '/movimientos-bancarios',
      '/conciliacion',
      '/settings/cuentas-bancarias',
      '/conciliacion/informe',
      '/plan-cuentas',
      '/contactos',
      '/documentos-fisicos',
      '/gestiones/cierre',
    ]);
  });

  // T-03: mapeo ítem → sección
  it('sección configuracion contiene /periodos-fiscales y /tipos-documento-fisico', () => {
    const tos = itemsDeSeccion('configuracion').map((i) => i.to);
    expect(tos).toContain('/periodos-fiscales');
    expect(tos).toContain('/tipos-documento-fisico');
  });

  it('sección contabilidad NO contiene /periodos-fiscales ni /tipos-documento-fisico', () => {
    const tos = itemsDeSeccion('contabilidad').map((i) => i.to);
    expect(tos).not.toContain('/periodos-fiscales');
    expect(tos).not.toContain('/tipos-documento-fisico');
  });

  it('sección granja contiene /granja, /granja/lotes, /granja/tipos-registro', () => {
    const tos = itemsDeSeccion('granja').map((i) => i.to);
    expect(tos).toContain('/granja');
    expect(tos).toContain('/granja/lotes');
    expect(tos).toContain('/granja/tipos-registro');
  });

  it('sección administracion contiene los 5 ítems de gestión de org', () => {
    const tos = itemsDeSeccion('administracion').map((i) => i.to);
    expect(tos).toContain('/settings/empresa');
    expect(tos).toContain('/settings/members');
    expect(tos).toContain('/settings/roles');
    expect(tos).toContain('/settings/features');
    expect(tos).toContain('/settings/complementos');
  });

  it('sección configuracion contiene /configuracion (disabled, vertical CONTABILIDAD)', () => {
    const item = itemsDeSeccion('configuracion').find((i) => i.to === '/configuracion');
    expect(item).toBeDefined();
    expect(item?.disabled).toBe(true);
    expect(item?.vertical).toBe('CONTABILIDAD');
  });
});

beforeEach(() => {
  // Default: sin packs activos. Como ningún NAV_ITEM real declara `pack`,
  // los ítems de producción no se ven afectados por este default.
  mockPacks([]);
  // Default: sin roles de sistema (fail-closed para el filtro SystemRole).
  setAuthRoles([]);
  // Default: todos los subgrupos ABIERTOS. Los tests de gating miden el filtro,
  // no el plegado — el describe de subgrupos setea su propio estado.
  expandAllGroups();
});

afterEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, accessToken: null });
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

// Guard anti-drift: un ítem de nav nuevo sin gate queda visible para todos sin
// que nadie lo note. Este test obliga a declarar requiredPermission O
// requiredSystemRole salvo en los ítems públicos (Panel) o deshabilitados.
describe('NAV_ITEMS — cobertura de gating', () => {
  const RUTAS_PUBLICAS = new Set(['/']);

  it('todo ítem no-público y no-disabled declara requiredPermission o requiredSystemRole', () => {
    for (const item of NAV_ITEMS) {
      if (RUTAS_PUBLICAS.has(item.to) || item.disabled === true) continue;
      const tieneGate =
        item.requiredPermission !== undefined || item.requiredSystemRole !== undefined;
      expect(
        tieneGate,
        `"${item.label}" (${item.to}) debe declarar requiredPermission o requiredSystemRole`,
      ).toBe(true);
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

// ─────────────────────────────────────────────────────────────────────────────
// T-08 — Header adaptativo (RED → GREEN en T-11/T-12)
// ─────────────────────────────────────────────────────────────────────────────
describe('NAV_SECTIONS — header adaptativo', () => {
  // Sonda de módulo extra — patrón análogo D-06: push a NAV_SECTIONS.
  const sondaSeccionModulo: import('./nav-items').NavSection = {
    id: 'ventas',
    label: 'Ventas',
    kind: 'modulo',
    items: [
      {
        to: '/__probe-module__',
        label: 'Sonda Módulo',
        icon: navItemsModule.NAV_ITEMS[0]!.icon,
        // Sin vertical ni pack → siempre visible (pasa todos los filtros)
      },
    ],
  };

  afterEach(() => {
    const idx = NAV_SECTIONS.indexOf(sondaSeccionModulo);
    if (idx !== -1) NAV_SECTIONS.splice(idx, 1);
  });

  // Caso 1 — 1 módulo visible NO renderiza header de módulo
  it('Caso 1 — 1 módulo visible: NO renderiza header de módulo "Contabilidad"', () => {
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // Header de módulo OCULTO cuando solo hay 1 módulo
    expect(screen.queryByRole('heading', { name: 'Contabilidad' })).not.toBeInTheDocument();
    // Ítems contables SÍ visibles (el filtro de visibilidad funciona)
    expect(screen.getAllByText('Comprobantes').length).toBeGreaterThan(0);
    // Headers transversales SÍ presentes
    expect(screen.getByRole('heading', { name: 'Administración' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
  });

  // Caso 2 — 2 módulos visibles SÍ renderiza ambos headers
  it('Caso 2 — 2 módulos visibles: SÍ renderiza headers de módulo', () => {
    NAV_SECTIONS.push(sondaSeccionModulo);
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getByRole('heading', { name: 'Contabilidad' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ventas' })).toBeInTheDocument();
  });

  // Caso 3 — sección sin ítems visibles no renderiza header
  it('Caso 3 — sección sin ítems visibles no renderiza su header', () => {
    mockPermissions({ isOwner: true });
    mockVertical('GRANJA'); // contabilidad no visible
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // Contabilidad no tiene ítems visibles en GRANJA → sin header
    expect(screen.queryByRole('heading', { name: 'Contabilidad' })).not.toBeInTheDocument();
  });

  // Caso 4 — collapsed suprime todos los headers
  it('Caso 4 — collapsed suprime todos los headers de sección', () => {
    NAV_SECTIONS.push(sondaSeccionModulo);
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    expect(screen.queryByRole('heading', { name: 'Contabilidad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ventas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Administración' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  // Caso 9 — collapsed: divider ENTRE secciones, nunca antes de la primera (regresión W-1)
  it('Caso 9 — collapsed renderiza divisores solo ENTRE secciones (no antes de la primera)', () => {
    NAV_SECTIONS.push(sondaSeccionModulo);
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    // Secciones visibles en este setup: Contabilidad, Ventas(sonda), Administración,
    // Configuración → 4 secciones → 3 divisores (uno entre cada par, ninguno arriba).
    const { container } = render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    const dividers = container.querySelectorAll('div.border-t');
    // Con el bug `idx >= 0` habría 4 (uno huérfano antes de la primera sección).
    expect(dividers.length).toBe(3);
  });

  // Caso 5 — Panel siempre visible sin header propio
  it('Caso 5 — Panel siempre visible sin header de sección', () => {
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Panel').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Panel' })).not.toBeInTheDocument();
  });

  // Caso 6 — headers transversales siempre presentes con ítems
  it('Caso 6 — headers transversales Administración y Configuración presentes con ítems', () => {
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getByRole('heading', { name: 'Administración' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
  });

  // Caso 7 — headers transversales ausentes sin ítems visibles
  it('Caso 7 — headers transversales ausentes cuando no hay ítems visibles', () => {
    // Sin permisos + sin roles + vertical GRANJA:
    //   Administración: todos tienen requiredPermission → sin permisos todos ocultos
    //                   Complementos tiene requiredSystemRole → sin OWNER/ADMIN oculto
    //   Configuración: periodos/tipos-doc tienen vertical CONTABILIDAD → ocultos en GRANJA
    //                  Configuración contable tiene vertical CONTABILIDAD → oculta en GRANJA
    // Resultado: ambas secciones transversales sin ítems visibles → sin headers.
    mockPermissions({ allowedPermissions: [] });
    mockVertical('GRANJA');
    setAuthRoles([]); // sin OWNER/ADMIN → Complementos gateado
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByRole('heading', { name: 'Administración' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  // Caso 8 — Configuración contable ausente en vertical GRANJA
  it('Caso 8 — "Configuración contable" ausente en vertical GRANJA', () => {
    mockPermissions({ isOwner: true });
    mockVertical('GRANJA');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Configuración contable')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-09 — Pack sonde migrada a NAV_SECTIONS (D-06)
// ─────────────────────────────────────────────────────────────────────────────
describe('NavList — filtrado por pack (riel eje 2)', () => {
  // Ningún NAV_ITEM real declara `pack` todavía (no hay pack concreto construido).
  // Para probar el tercer eje del riel inyectamos un ítem-sonda con `pack` directamente
  // en NAV_SECTIONS (sección 'contabilidad') — D-06: NavList itera NAV_SECTIONS, no NAV_ITEMS.
  const PROBE_LABEL = 'Sonda Pack';
  const PROBE_PACK = 'contabilidad.adjuntos';
  const probeItem: NavItem = {
    to: '/__probe-pack__',
    label: PROBE_LABEL,
    icon: navItemsModule.NAV_ITEMS[0]!.icon,
    requiredPermission: 'contabilidad.eeff.read',
    vertical: 'CONTABILIDAD',
    pack: PROBE_PACK,
  };

  beforeEach(() => {
    // isOwner=true + vertical CONTABILIDAD para aislar el filtro de pack.
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    // D-06: pushear a NAV_SECTIONS[contabilidad].items (no a NAV_ITEMS)
    NAV_SECTIONS.find((s) => s.id === 'contabilidad')!.items.push(probeItem);
  });

  afterEach(() => {
    const section = NAV_SECTIONS.find((s) => s.id === 'contabilidad')!;
    const idx = section.items.indexOf(probeItem);
    if (idx !== -1) section.items.splice(idx, 1);
  });

  it('ítem sin `pack` pasa el filtro de pack (visible aun sin packs activos)', () => {
    mockPacks([]);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // Balance General no declara `pack` → visible aunque packsActivos esté vacío.
    expect(screen.getAllByText('Balance General').length).toBeGreaterThan(0);
  });

  it('ítem con `pack` activo → visible', () => {
    mockPacks([PROBE_PACK]);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText(PROBE_LABEL).length).toBeGreaterThan(0);
  });

  it('ítem con `pack` NO activo → oculto', () => {
    mockPacks(['contabilidad.rag']); // otro pack, no el de la sonda
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText(PROBE_LABEL)).not.toBeInTheDocument();
  });

  it('loading (packsActivos indefinido) → ítem con `pack` oculto (fail-closed)', () => {
    mockPacks(undefined);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText(PROBE_LABEL)).not.toBeInTheDocument();
  });

  it('cascada completa permiso ∧ vertical ∧ pack: falla cualquiera → oculto', () => {
    // Pack activo y vertical OK, pero SIN el permiso requerido → oculto.
    mockPermissions({ allowedPermissions: [] });
    mockPacks([PROBE_PACK]);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText(PROBE_LABEL)).not.toBeInTheDocument();
  });

  it('cascada completa: pack activo + vertical ajeno → oculto', () => {
    // Permiso OK (isOwner) y pack activo, pero vertical GRANJA ≠ CONTABILIDAD → oculto.
    mockPermissions({ isOwner: true });
    mockVertical('GRANJA');
    mockPacks([PROBE_PACK]);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText(PROBE_LABEL)).not.toBeInTheDocument();
  });
});

describe('NavList — filtrado por requiredSystemRole', () => {
  // Para aislar el filtro de SystemRole, damos isOwner=true + vertical CONTABILIDAD
  // (para que pasen los filtros de permiso y vertical), y variamos solo los roles.
  beforeEach(() => {
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
  });

  it('ítem "Complementos" visible cuando user.roles incluye OWNER', () => {
    setAuthRoles(['OWNER']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Complementos').length).toBeGreaterThan(0);
  });

  it('ítem "Complementos" visible cuando user.roles incluye ADMIN', () => {
    setAuthRoles(['ADMIN']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Complementos').length).toBeGreaterThan(0);
  });

  it('ítem "Complementos" oculto con rol custom sin OWNER/ADMIN (fail-closed)', () => {
    setAuthRoles(['contador-slug']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Complementos')).not.toBeInTheDocument();
  });

  it('ítem "Complementos" oculto sin user.roles (fail-closed)', () => {
    setAuthRoles(undefined); // user null → roles undefined
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Complementos')).not.toBeInTheDocument();
  });

  it('ítem "Complementos" oculto con roles vacío (fail-closed)', () => {
    setAuthRoles([]);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Complementos')).not.toBeInTheDocument();
  });
});

// REQ-SB-10 (tarea 0.20-0.21, change conciliacion-bancaria): "Conciliación
// bancaria" es el primer NAV_ITEM de producción con `pack` seteado
// (`contabilidad.conciliacion`). Misma cascada AND fail-closed de REQ-SB-05,
// sin código nuevo en NavList ni en el filtrado por pack (0.21 — el mecanismo
// genérico ya alcanza).
describe('NAV_ITEMS — primer ítem de pack de dominio (REQ-SB-10, conciliación bancaria)', () => {
  it('el ítem "Conciliación bancaria" declara pack, requiredPermission y vertical', () => {
    const item = NAV_ITEMS.find((i) => i.to === '/conciliacion');
    expect(item).toBeDefined();
    expect(item?.pack).toBe('contabilidad.conciliacion');
    expect(item?.requiredPermission).toBe('contabilidad.conciliacion.read');
    expect(item?.vertical).toBe('CONTABILIDAD');
  });

  it('Escenario 1 — pack activo + permiso + vertical CONTABILIDAD: el ítem está visible', () => {
    mockPermissions({ allowedPermissions: ['contabilidad.conciliacion.read'] });
    mockVertical('CONTABILIDAD');
    mockPacks(['contabilidad.conciliacion']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Conciliación bancaria').length).toBeGreaterThan(0);
  });

  it('Escenario 2 — pack NO activo (org que lo desactivó): el ítem está oculto', () => {
    mockPermissions({ allowedPermissions: ['contabilidad.conciliacion.read'] });
    mockVertical('CONTABILIDAD');
    mockPacks([]); // pack otorgado por defecto pero apagado por la org
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Conciliación bancaria')).not.toBeInTheDocument();
  });

  it('Escenario 3 — permiso ausente con pack activo: el ítem está oculto (cascada AND)', () => {
    mockPermissions({ allowedPermissions: [] }); // sin contabilidad.conciliacion.read
    mockVertical('CONTABILIDAD');
    mockPacks(['contabilidad.conciliacion']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Conciliación bancaria')).not.toBeInTheDocument();
  });
});

// Task 3.12 (change informe-conciliacion-bancaria): "Informe de conciliación"
// es la 4ª pantalla del pack en el grupo Bancos — misma cascada AND fail-closed
// permiso ∧ vertical ∧ pack que el resto del grupo, sin código nuevo en NavList.
describe('NAV_ITEMS — Informe de conciliación (task 3.12, informe)', () => {
  it('el ítem "Informe de conciliación" declara pack, requiredPermission y vertical', () => {
    const item = NAV_ITEMS.find((i) => i.to === '/conciliacion/informe');
    expect(item).toBeDefined();
    expect(item?.label).toBe('Informe de conciliación');
    expect(item?.pack).toBe('contabilidad.conciliacion');
    expect(item?.requiredPermission).toBe('contabilidad.conciliacion.read');
    expect(item?.vertical).toBe('CONTABILIDAD');
  });

  it('pack activo + permiso + vertical CONTABILIDAD: el ítem está visible', () => {
    mockPermissions({ allowedPermissions: ['contabilidad.conciliacion.read'] });
    mockVertical('CONTABILIDAD');
    mockPacks(['contabilidad.conciliacion']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Informe de conciliación').length).toBeGreaterThan(0);
  });

  it('sin el pack activo: el ítem está oculto', () => {
    mockPermissions({ allowedPermissions: ['contabilidad.conciliacion.read'] });
    mockVertical('CONTABILIDAD');
    mockPacks([]);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Informe de conciliación')).not.toBeInTheDocument();
  });

  it('sin el permiso .read (con pack activo): el ítem está oculto', () => {
    mockPermissions({ allowedPermissions: [] });
    mockVertical('CONTABILIDAD');
    mockPacks(['contabilidad.conciliacion']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Informe de conciliación')).not.toBeInTheDocument();
  });
});

// REQ-VMB-14 (change verificador-movimientos-bancarios): "Movimientos
// bancarios" vive en Contabilidad con la MISMA cascada permiso ∧ pack que
// Conciliación bancaria — sin cualquiera de los dos, oculto (fail-closed).
describe('NAV_ITEMS — Movimientos bancarios (REQ-VMB-14, verificador)', () => {
  it('el ítem "Movimientos bancarios" declara pack, requiredPermission y vertical', () => {
    const item = NAV_ITEMS.find((i) => i.to === '/movimientos-bancarios');
    expect(item).toBeDefined();
    expect(item?.label).toBe('Movimientos bancarios');
    expect(item?.pack).toBe('contabilidad.conciliacion');
    expect(item?.requiredPermission).toBe('contabilidad.conciliacion.read');
    expect(item?.vertical).toBe('CONTABILIDAD');
  });

  it('pack activo + permiso + vertical CONTABILIDAD: el ítem está visible', () => {
    mockPermissions({ allowedPermissions: ['contabilidad.conciliacion.read'] });
    mockVertical('CONTABILIDAD');
    mockPacks(['contabilidad.conciliacion']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getAllByText('Movimientos bancarios').length).toBeGreaterThan(0);
  });

  it('sin el pack activo: el ítem está oculto', () => {
    mockPermissions({ allowedPermissions: ['contabilidad.conciliacion.read'] });
    mockVertical('CONTABILIDAD');
    mockPacks([]);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Movimientos bancarios')).not.toBeInTheDocument();
  });

  it('sin el permiso .read (con pack activo): el ítem está oculto', () => {
    mockPermissions({ allowedPermissions: [] });
    mockVertical('CONTABILIDAD');
    mockPacks(['contabilidad.conciliacion']);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByText('Movimientos bancarios')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Subgrupos colapsables dentro de una sección.
//
// Motivo: la sección Contabilidad creció a 15 ítems planos (25 filas de sidebar,
// no entra en 1080p). Se parte en subgrupos plegables, y el pack de conciliación
// —cuyas 3 pantallas estaban repartidas entre Contabilidad y Configuración— pasa
// a vivir COMPLETO en un único grupo "Bancos": un pack es una unidad comercial,
// aparece y desaparece como un bloque.
//
// El grupo NO declara gate propio: su visibilidad se DERIVA de sus ítems, igual
// que una sección vacía se descarta. La cascada de REQ-SB-05 sigue siendo la
// única fuente de verdad del gating.
// ─────────────────────────────────────────────────────────────────────────────
describe('NAV_SECTIONS — subgrupos colapsables', () => {
  beforeEach(() => {
    collapseAllGroups();
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    mockPacks(['contabilidad.conciliacion']);
  });

  // ── Estructura de datos ────────────────────────────────────────────────────

  it('contabilidad declara los subgrupos en orden', () => {
    const c = NAV_SECTIONS.find((s) => s.id === 'contabilidad');
    expect((c?.groups ?? []).map((g) => g.id)).toEqual(['libros', 'eeff', 'bancos', 'maestros']);
  });

  it('Comprobantes queda suelto ARRIBA y Cierre del ejercicio suelto ABAJO', () => {
    const c = NAV_SECTIONS.find((s) => s.id === 'contabilidad');
    expect(c?.items.map((i) => i.to)).toEqual(['/comprobantes']);
    expect((c?.trailingItems ?? []).map((i) => i.to)).toEqual(['/gestiones/cierre']);
  });

  it('el grupo Bancos agrupa las 4 pantallas del pack de conciliación', () => {
    expect(grupo('contabilidad', 'bancos')?.items.map((i) => i.to)).toEqual([
      '/movimientos-bancarios',
      '/conciliacion',
      '/settings/cuentas-bancarias',
      '/conciliacion/informe',
    ]);
  });

  it('Cuentas bancarias YA NO vive en la sección Configuración', () => {
    expect(itemsDeSeccion('configuracion').map((i) => i.to)).not.toContain(
      '/settings/cuentas-bancarias',
    );
  });

  // Guard anti-drift bidireccional: es EXACTAMENTE la regresión que ocurrió
  // (los ítems del pack terminaron repartidos en 2 secciones). Si alguien suma
  // una pantalla del pack fuera de Bancos, o mete en Bancos algo sin el gate
  // del pack, esto rompe en CI.
  it('todo ítem con pack contabilidad.conciliacion vive dentro del grupo Bancos', () => {
    const enBancos = new Set(grupo('contabilidad', 'bancos')?.items.map((i) => i.to) ?? []);
    for (const item of NAV_ITEMS) {
      if (item.pack !== 'contabilidad.conciliacion') continue;
      expect(
        enBancos.has(item.to),
        `"${item.label}" (${item.to}) declara el pack de conciliación y debe estar en el grupo Bancos`,
      ).toBe(true);
    }
  });

  it('todo ítem del grupo Bancos declara el pack contabilidad.conciliacion', () => {
    for (const item of grupo('contabilidad', 'bancos')?.items ?? []) {
      expect(
        item.pack,
        `"${item.label}" (${item.to}) está en Bancos y debe declarar el pack`,
      ).toBe('contabilidad.conciliacion');
    }
  });

  it('cada grupo declara id, label e icono, y ningún id se repite', () => {
    const ids = NAV_SECTIONS.flatMap((s) => (s.groups ?? []).map((g) => g.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of NAV_SECTIONS) {
      for (const g of s.groups ?? []) {
        expect(g.label.length).toBeGreaterThan(0);
        expect(g.items.length).toBeGreaterThan(0);
        // El icono es OBLIGATORIO: en modo riel es lo ÚNICO que representa al
        // grupo. Un grupo sin icono sería un cuadrado vacío de 64px.
        expect(g.icon, `el grupo "${g.label}" debe declarar icono para el riel`).toBeDefined();
      }
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  it('plegado por defecto: se ve el header del grupo, NO sus ítems', () => {
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Bancos' })).toBeInTheDocument();
    expect(screen.queryByText('Conciliación bancaria')).not.toBeInTheDocument();
    expect(screen.queryByText('Balance General')).not.toBeInTheDocument();
    // Los sueltos NO se pliegan nunca
    expect(screen.getAllByText('Comprobantes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cierre del ejercicio').length).toBeGreaterThan(0);
  });

  it('el header del grupo expone aria-expanded', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: 'Bancos' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    expect(screen.getByRole('button', { name: 'Bancos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('click en el header despliega los ítems del grupo', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    await user.click(screen.getByRole('button', { name: 'Bancos' }));
    expect(screen.getAllByText('Conciliación bancaria').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Movimientos bancarios').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cuentas bancarias').length).toBeGreaterThan(0);
  });

  it('un segundo click vuelve a plegar el grupo', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    await user.click(screen.getByRole('button', { name: 'Libros' }));
    expect(screen.getAllByText('Libro Diario').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Libros' }));
    expect(screen.queryByText('Libro Diario')).not.toBeInTheDocument();
  });

  it('el grupo de la ruta activa arranca ABIERTO sin tocar nada', () => {
    render(
      <Wrapper initialEntries={['/conciliacion']}>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Bancos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getAllByText('Conciliación bancaria').length).toBeGreaterThan(0);
    // Los demás siguen plegados
    expect(screen.getByRole('button', { name: 'Libros' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('la preferencia guardada gana sobre el default de ruta activa', () => {
    act(() => {
      useSidebarStore.setState({ openGroups: { bancos: false } });
    });
    render(
      <Wrapper initialEntries={['/conciliacion']}>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Bancos' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  // ── Gating derivado (sin código de gating nuevo) ────────────────────────────

  it('pack inactivo: el grupo Bancos desaparece ENTERO, header incluido', () => {
    mockPacks([]);
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.queryByRole('button', { name: 'Bancos' })).not.toBeInTheDocument();
    // El resto de la sección sigue en pie
    expect(screen.getByRole('button', { name: 'Libros' })).toBeInTheDocument();
    expect(screen.getAllByText('Comprobantes').length).toBeGreaterThan(0);
  });

  it('vertical GRANJA: ningún grupo de Contabilidad se renderiza', () => {
    mockVertical('GRANJA');
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    for (const label of ['Libros', 'Estados financieros', 'Bancos', 'Maestros']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('el grupo se descarta cuando sus ítems quedan gateados por permiso', () => {
    // Solo permiso de conciliación → Bancos vive, Libros y Estados financieros no.
    mockPermissions({ allowedPermissions: ['contabilidad.conciliacion.read'] });
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Bancos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Libros' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Estados financieros' }),
    ).not.toBeInTheDocument();
  });

  it('el grupo muestra solo los ítems que pasan el filtro, no todos', async () => {
    const user = userEvent.setup();
    // Permiso de conciliación pero NO de cuentas bancarias… ambos usan el mismo
    // permiso, así que probamos con eeff parcial: solo eeff.read da los 6.
    mockPermissions({ allowedPermissions: ['contabilidad.conciliacion.read'] });
    render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    await user.click(screen.getByRole('button', { name: 'Bancos' }));
    expect(screen.getAllByText('Conciliación bancaria').length).toBeGreaterThan(0);
    // Maestros entero gateado → ni siquiera existe el header
    expect(screen.queryByRole('button', { name: 'Maestros' })).not.toBeInTheDocument();
  });

  // ── Modo riel (collapsed): un icono por grupo + flyout ─────────────────────
  //
  // En 64px no entran headers ni chevrons. Aplanar los grupos a iconos sueltos
  // no servía: el riel seguía teniendo 25 iconos casi idénticos (no distinguís
  // Balance General de Balance de Comprobación sin hoverear los dos) y se
  // desbordaba fuera del viewport. Cada grupo colapsa a UN icono que abre un
  // flyout con sus ítems — 15 blancos en vez de 25.

  it('modo riel: un botón por grupo; sus ítems NO están en el DOM', () => {
    render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    for (const label of ['Libros', 'Estados financieros', 'Bancos', 'Maestros']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText('Conciliación bancaria')).not.toBeInTheDocument();
    expect(screen.queryByText('Balance General')).not.toBeInTheDocument();
  });

  it('modo riel: los ítems sueltos siguen planos, sin flyout', () => {
    render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    expect(screen.getAllByLabelText('Comprobantes').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Cierre del ejercicio').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Panel').length).toBeGreaterThan(0);
    // No son grupos: no hay botón que los pliegue.
    expect(screen.queryByRole('button', { name: 'Comprobantes' })).not.toBeInTheDocument();
  });

  it('modo riel: click en el icono del grupo abre el flyout con sus ítems', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    await user.click(screen.getByRole('button', { name: 'Bancos' }));
    expect(await screen.findByText('Movimientos bancarios')).toBeInTheDocument();
    expect(screen.getByText('Conciliación bancaria')).toBeInTheDocument();
    expect(screen.getByText('Cuentas bancarias')).toBeInTheDocument();
    // Los otros grupos siguen cerrados
    expect(screen.queryByText('Libro Diario')).not.toBeInTheDocument();
  });

  it('modo riel: el flyout se cierra al elegir un ítem', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    await user.click(screen.getByRole('button', { name: 'Bancos' }));
    await user.click(await screen.findByText('Conciliación bancaria'));
    expect(screen.queryByText('Conciliación bancaria')).not.toBeInTheDocument();
  });

  it('modo riel: el grupo que contiene la ruta activa queda marcado', () => {
    render(
      <Wrapper initialEntries={['/conciliacion']}>
        <NavList collapsed />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Bancos' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Libros' })).not.toHaveAttribute('aria-current');
  });

  it('modo riel: el plegado guardado del modo expandido NO afecta al riel', () => {
    // `openGroups` es del modo expandido. En el riel manda el flyout.
    act(() => {
      useSidebarStore.setState({ openGroups: { bancos: true, libros: true } });
    });
    render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    expect(screen.queryByText('Libro Diario')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Libros' })).toBeInTheDocument();
  });

  it('modo riel: pack inactivo → no hay icono de Bancos', () => {
    mockPacks([]);
    render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    expect(screen.queryByRole('button', { name: 'Bancos' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Libros' })).toBeInTheDocument();
  });

  it('modo riel: sigue habiendo un divisor por par de secciones, no por grupo', () => {
    const { container } = render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    // Secciones visibles en CONTABILIDAD: Contabilidad, Administración,
    // Configuración → 3 secciones → 2 divisores. Los grupos no agregan ninguno.
    expect(container.querySelectorAll('div.border-t').length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regresión: el <nav> no scrolleaba por su cuenta.
//
// `dashboard-shell.tsx` monta la sidebar dentro de un `flex h-screen`, y el
// <nav> es `flex-1` sin overflow ni `min-h-0`. Cuando el menú superaba el alto
// del viewport, el sobrante se desbordaba FUERA de la pantalla sin barra de
// scroll — y como el root es h-screen, la página tampoco scrolleaba: los ítems
// de abajo quedaban INALCANZABLES. Mismo problema en el drawer mobile, que
// monta NavList dentro de un SheetContent `flex flex-col h-full`.
// ─────────────────────────────────────────────────────────────────────────────
describe('NavList — scroll propio', () => {
  it('el <nav> declara overflow-y-auto y min-h-0', () => {
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
    const { container } = render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    // min-h-0 es imprescindible: sin él un hijo flex no baja de su content
    // height y `overflow-y-auto` no llega a activarse nunca.
    expect(nav?.className).toContain('overflow-y-auto');
    expect(nav?.className).toContain('min-h-0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regresión: el piso táctil de 44px (§7).
//
// El sidebar se salvó ENTERO del PR #285 —que puso el piso en `button.tsx` e
// `input.tsx`— porque acá los controles son `<a>` y `<button>` CRUDOS, sin pasar
// por el primitivo. Peor: las clases decían `py-3 md:py-2` y `p-3 md:p-2`, que
// es la convención PROHIBIDA con otra cara — le dan 44px al teléfono y se los
// sacan al iPad, que es táctil. Medido a 768px con dedo emulado: links 36px,
// headers de grupo 28px, riel 32px.
//
// Este test es DÉBIL a propósito y hay que saberlo: assertea el string de la
// clase, no el píxel renderizado (jsdom no compila Tailwind ni evalúa
// `pointer: coarse`). La prueba de verdad es `pnpm run medir:ui -- --tactil`.
// Existe igual porque nada cubría estas tres cadenas y por eso sobrevivieron
// intactas a un PR que iba justo de esto.
// ─────────────────────────────────────────────────────────────────────────────
describe('NavList — piso táctil de 44px (pointer: coarse)', () => {
  beforeEach(() => {
    mockPermissions({ isOwner: true });
    mockVertical('CONTABILIDAD');
  });

  it('los links de navegación declaran el piso, y NO por breakpoint', () => {
    const { container } = render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    const links = [...container.querySelectorAll('nav a')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className).toContain('pointer-coarse:min-h-11');
      // El gemelo del assert de arriba: sin esto, reintroducir `md:py-2` al lado
      // del piso pasaría el test mientras le devuelve densidad de escritorio al
      // iPad — que es exactamente el bug que este bloque cubre.
      expect(link.className).not.toMatch(/md:(py|p)-/);
    }
  });

  it('los headers de grupo (button crudo) declaran el piso', () => {
    const { container } = render(
      <Wrapper>
        <NavList />
      </Wrapper>,
    );
    // Los headers son los únicos <button> del nav con aria-expanded.
    const headers = [...container.querySelectorAll('nav button[aria-expanded]')];
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(header.className).toContain('pointer-coarse:min-h-11');
    }
  });

  it('en modo riel el piso va en las DOS dimensiones', () => {
    const { container } = render(
      <Wrapper>
        <NavList collapsed />
      </Wrapper>,
    );
    const controles = [...container.querySelectorAll('nav a, nav button')];
    expect(controles.length).toBeGreaterThan(0);
    for (const el of controles) {
      // Icon-only: sin min-w el blanco queda de 32px de ancho aunque el alto ya
      // cumpla. El riel mide 64px, así que los 44 entran.
      expect(el.className).toContain('pointer-coarse:min-h-11');
      expect(el.className).toContain('pointer-coarse:min-w-11');
      expect(el.className).not.toMatch(/md:(py|px|p)-/);
    }
  });
});
