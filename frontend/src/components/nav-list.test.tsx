import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as usePermissionsModule from '@/lib/use-permissions';
import * as usePacksModule from '@/lib/use-packs';
import * as useVerticalModule from '@/lib/use-vertical';
import { useAuthStore } from '@/stores/auth-store';
import type { VerticalActivo } from '@/types/api';
import { TooltipProvider } from '@/components/ui/tooltip';

import * as navItemsModule from './nav-items';
import { NAV_ITEMS, NAV_SECTIONS, PANEL_ITEM, type NavItem } from './nav-items';
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

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>{children}</MemoryRouter>
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

  it('NAV_ITEMS derivado === [PANEL_ITEM, ...NAV_SECTIONS.flatMap(s => s.items)]', () => {
    const expected = [PANEL_ITEM, ...NAV_SECTIONS.flatMap((s) => s.items)];
    expect(NAV_ITEMS).toEqual(expected);
  });

  // T-02: orden interno de Contabilidad
  it('sección contabilidad tiene los ítems en el orden correcto', () => {
    const contabilidad = NAV_SECTIONS.find((s) => s.id === 'contabilidad');
    expect(contabilidad?.items.map((i) => i.to)).toEqual([
      '/comprobantes',
      '/libros/diario',
      '/libros/mayor',
      '/eeff/balance',
      '/eeff/balance-comprobacion',
      '/eeff/hoja-trabajo',
      '/eeff/resultados',
      '/eeff/evolucion-patrimonio',
      '/eeff/flujo-efectivo',
      '/plan-cuentas',
      '/contactos',
      '/documentos-fisicos',
    ]);
  });

  // T-03: mapeo ítem → sección
  it('sección configuracion contiene /periodos-fiscales y /tipos-documento-fisico', () => {
    const config = NAV_SECTIONS.find((s) => s.id === 'configuracion');
    const tos = config?.items.map((i) => i.to) ?? [];
    expect(tos).toContain('/periodos-fiscales');
    expect(tos).toContain('/tipos-documento-fisico');
  });

  it('sección contabilidad NO contiene /periodos-fiscales ni /tipos-documento-fisico', () => {
    const cont = NAV_SECTIONS.find((s) => s.id === 'contabilidad');
    const tos = cont?.items.map((i) => i.to) ?? [];
    expect(tos).not.toContain('/periodos-fiscales');
    expect(tos).not.toContain('/tipos-documento-fisico');
  });

  it('sección granja contiene /granja, /granja/lotes, /granja/tipos-registro', () => {
    const granja = NAV_SECTIONS.find((s) => s.id === 'granja');
    const tos = granja?.items.map((i) => i.to) ?? [];
    expect(tos).toContain('/granja');
    expect(tos).toContain('/granja/lotes');
    expect(tos).toContain('/granja/tipos-registro');
  });

  it('sección administracion contiene los 5 ítems de gestión de org', () => {
    const admin = NAV_SECTIONS.find((s) => s.id === 'administracion');
    const tos = admin?.items.map((i) => i.to) ?? [];
    expect(tos).toContain('/settings/empresa');
    expect(tos).toContain('/settings/members');
    expect(tos).toContain('/settings/roles');
    expect(tos).toContain('/settings/features');
    expect(tos).toContain('/settings/complementos');
  });

  it('sección configuracion contiene /configuracion (disabled, vertical CONTABILIDAD)', () => {
    const config = NAV_SECTIONS.find((s) => s.id === 'configuracion');
    const item = config?.items.find((i) => i.to === '/configuracion');
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

// Guard anti-drift: ningún NAV_ITEM de producción declara `pack` todavía. El riel
// queda listo para enchufar; cuando se construya el primer pack, este test obliga a
// revisar conscientemente la decisión (y a actualizar la cascada de filtros si cambia).
describe('NAV_ITEMS — riel de pack sin enchufar aún', () => {
  it('ningún ítem de producción declara `pack` (riel listo, sin pack concreto)', () => {
    for (const item of NAV_ITEMS) {
      expect(
        item.pack,
        `"${item.label}" (${item.to}) declara pack sin que exista un pack concreto construido`,
      ).toBeUndefined();
    }
  });
});
