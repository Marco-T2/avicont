import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Bird,
  BookCheck,
  BookMarked,
  BookOpen,
  BookText,
  Boxes,
  Building2,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  Contact,
  Droplet,
  FileBadge,
  FileStack,
  FileText,
  FolderOpen,
  Home,
  Landmark,
  LayoutDashboard,
  Library,
  ListChecks,
  Scale,
  Settings,
  Shield,
  ShoppingCart,
  Tags,
  ToggleRight,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

import { PERMISSIONS } from '@/lib/permissions';
import type { SystemRole } from '@/types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  /**
   * Permiso requerido para mostrar el ítem. Si está ausente, el ítem siempre
   * es visible (migración incremental — los ítems sin permiso no se filtran).
   * Coincide con el permiso que gatéa la ruta correspondiente en router.tsx.
   */
  requiredPermission?: string;
  /**
   * Vertical al que pertenece el ítem. Si está ausente, el ítem es de
   * ADMINISTRACIÓN (cross-vertical) y se muestra en ambos verticales.
   * Items con permiso contabilidad.* → 'CONTABILIDAD'; granja.* → 'GRANJA'.
   */
  vertical?: 'CONTABILIDAD' | 'GRANJA';
  /**
   * Clave del Pack (eje 2) que habilita el ítem. Si está ausente, el ítem
   * siempre pasa el filtro de pack (como los ítems sin `vertical` pasan el de
   * vertical). Si está presente, el ítem solo se muestra cuando esa clave está
   * en los packs activos de la org (`packsActivos` de /me/permissions).
   * Coincide con la clave que el backend exige vía `@RequirePack`.
   */
  pack?: string;
  /**
   * SystemRoles que pueden ver el ítem. Si está ausente, sin gate de rol de
   * sistema. Si está presente, el ítem solo se muestra si el usuario tiene al
   * menos uno (useHasSystemRole). Coincide con el @RequireSystemRole del backend.
   */
  requiredSystemRole?: SystemRole[];
}

/**
 * Subgrupo colapsable DENTRO de una sección — segundo (y último) nivel de
 * jerarquía del menú.
 *
 * Deliberadamente NO tiene campos de gating. La visibilidad de un grupo se
 * DERIVA de sus ítems: si ninguno pasa la cascada de `NavList`, el grupo entero
 * (header incluido) desaparece, igual que una sección sin ítems visibles. Si el
 * grupo declarara su propio `pack`/`vertical` habría dos verdades que se pueden
 * desincronizar; la cascada por ítem sigue siendo la única fuente de verdad.
 */
export interface NavGroup {
  /** ID estable: key de React y clave de plegado persistido en useSidebarStore. */
  id: string;
  /** Header clickeable del grupo. Ej: 'Bancos', 'Estados financieros'. */
  label: string;
  /**
   * Icono que representa al grupo en el RIEL de 64px, donde el grupo colapsa a
   * un único botón que abre un flyout. Obligatorio: sin icono el grupo sería un
   * cuadrado vacío. En modo expandido NO se usa — ahí el header es chevron +
   * label, que se lee como encabezado y no compite con los ítems.
   *
   * Puede repetir el icono de un ítem que viva en OTRO grupo: en el riel solo se
   * ven iconos de grupo (nunca los de sus ítems), así que no hay colisión visual.
   */
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

export interface NavSection {
  /** ID estable para la key de React (Anti-F-06). Ej: 'contabilidad', 'administracion'. */
  id: string;
  /** Header visible de la sección. Ej: 'Contabilidad', 'Configuración'. */
  label: string;
  /**
   * 'modulo'     → sección de un vertical/pack. Su header se OCULTA cuando es el
   *                único módulo visible (decisión 3 del proposal); visible con ≥2.
   * 'transversal' → Administración / Configuración. Header SIEMPRE visible si la
   *                sección tiene ≥1 ítem visible.
   */
  kind: 'modulo' | 'transversal';
  /**
   * Subgrupos colapsables renderizados ANTES de `items` (REQ-SB-16). Un
   * NavGroup completo, sin semántica propia: mismo gating derivado, mismo
   * plegado persistido y mismo flyout de riel que `groups` — solo cambia la
   * posición. Existe porque `items` está reservado para "arriba de los grupos"
   * y PA-2 exige un grupo que abra la sección antes del suelto de uso diario.
   */
  leadingGroups?: NavGroup[];
  /**
   * Ítems sueltos que van ARRIBA de los grupos (`groups`), sin plegado.
   * Reservado para los accesos de uso diario: enterrarlos tras un click sería
   * un retroceso.
   */
  items: NavItem[];
  /** Subgrupos colapsables, renderizados DESPUÉS de `items`. */
  groups?: NavGroup[];
  /**
   * Ítems sueltos que van ABAJO de los grupos, sin plegado. Para lo esporádico
   * y de alto impacto (cierre de ejercicio): querés verlo, no buscarlo, pero
   * tampoco compitiendo con el uso diario por el lugar de arriba.
   */
  trailingItems?: NavItem[];
}

// Ítem suelto Panel — siempre arriba, sin header de sección (D-01).
export const PANEL_ITEM: NavItem = { to: '/', label: 'Panel', icon: Home };

// Nueva fuente de verdad del menú principal, organizada por sección.
// Consumida por NavList → AppSidebar (desktop) y MobileSidebar (drawer).
// Para agregar un módulo, meterlo en la sección correspondiente y ambos modos
// lo reflejan automáticamente.
export const NAV_SECTIONS: NavSection[] = [
  // ─── Contabilidad (vertical CONTABILIDAD) ─────────────────────────────────
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    kind: 'modulo',
    // ─── Comercial ANTES del suelto /comprobantes (PA-2, REQ-SB-15): el piloto
    // apunta a que el uso diario sea comercial y el asiento manual la excepción.
    // VERSIÓN PARCIAL deliberada: solo Ítems por ahora — un ítem de nav que
    // apunta a una ruta inexistente es un link roto en producción (§9.2, main
    // siempre deployable). El grupo se completa con Ventas y Cobros cuando
    // existan sus pantallas; van ANTES de Ítems en el orden final.
    // Ningún ítem declara `pack`: Ventas es FREE, núcleo del vertical (D-01).
    leadingGroups: [
      {
        id: 'comercial',
        label: 'Comercial',
        icon: ShoppingCart,
        items: [
          {
            to: '/items',
            label: 'Ítems',
            icon: Tags,
            requiredPermission: PERMISSIONS.contabilidad.items.read,
            vertical: 'CONTABILIDAD',
          },
        ],
      },
    ],
    // Suelto arriba (de `groups`): es la pantalla de uso diario del contador.
    items: [
      {
        to: '/comprobantes',
        label: 'Comprobantes',
        icon: FileText,
        requiredPermission: PERMISSIONS.contabilidad.asientos.read,
        vertical: 'CONTABILIDAD',
      },
    ],
    groups: [
      {
        id: 'libros',
        label: 'Libros',
        icon: Library,
        items: [
          {
            to: '/libros/diario',
            label: 'Libro Diario',
            icon: BookText,
            requiredPermission: PERMISSIONS.contabilidad.libroDiario.read,
            vertical: 'CONTABILIDAD',
          },
          {
            to: '/libros/mayor',
            label: 'Libro Mayor',
            icon: BookMarked,
            requiredPermission: PERMISSIONS.contabilidad.libroMayor.read,
            vertical: 'CONTABILIDAD',
          },
        ],
      },
      {
        id: 'eeff',
        label: 'Estados financieros',
        icon: BarChart3,
        items: [
          {
            to: '/eeff/balance',
            label: 'Balance General',
            icon: Scale,
            requiredPermission: PERMISSIONS.contabilidad.eeff.read,
            vertical: 'CONTABILIDAD',
          },
          {
            to: '/eeff/balance-comprobacion',
            label: 'Balance de Comprobación',
            icon: ListChecks,
            requiredPermission: PERMISSIONS.contabilidad.eeff.read,
            vertical: 'CONTABILIDAD',
          },
          {
            to: '/eeff/hoja-trabajo',
            label: 'Hoja de Trabajo',
            icon: Columns3,
            requiredPermission: PERMISSIONS.contabilidad.eeff.read,
            vertical: 'CONTABILIDAD',
          },
          {
            to: '/eeff/resultados',
            label: 'Estado de Resultados',
            icon: TrendingUp,
            requiredPermission: PERMISSIONS.contabilidad.eeff.read,
            vertical: 'CONTABILIDAD',
          },
          {
            to: '/eeff/evolucion-patrimonio',
            label: 'Evolución del Patrimonio',
            icon: Landmark,
            requiredPermission: PERMISSIONS.contabilidad.eeff.read,
            vertical: 'CONTABILIDAD',
          },
          {
            to: '/eeff/flujo-efectivo',
            label: 'Estado de Flujo de Efectivo',
            icon: Droplet,
            requiredPermission: PERMISSIONS.contabilidad.eeff.read,
            vertical: 'CONTABILIDAD',
          },
        ],
      },
      // ─── Bancos = la superficie COMPLETA del pack `contabilidad.conciliacion`
      // Un pack es una unidad comercial, no temática: el Owner lo activa desde
      // /settings/complementos y tiene que ver aparecer UN bloque, no piezas
      // repartidas por el menú. Antes "Cuentas bancarias" vivía en la sección
      // Configuración y las otras dos acá — mismo gate, dos lugares distintos.
      // El guard de nav-list.test.tsx impide que se vuelva a repartir.
      {
        id: 'bancos',
        label: 'Bancos',
        icon: Landmark,
        items: [
          // REQ-VMB-14: mayor unificado cross-cuenta, puerta de entrada al módulo
          // de conciliación — misma cascada permiso ∧ pack que el workspace.
          {
            to: '/movimientos-bancarios',
            label: 'Movimientos bancarios',
            icon: ArrowLeftRight,
            requiredPermission: PERMISSIONS.contabilidad.conciliacion.read,
            vertical: 'CONTABILIDAD',
            pack: 'contabilidad.conciliacion',
          },
          // Primer NAV_ITEM con `pack` (riel eje 2, REQ-SB-10).
          {
            to: '/conciliacion',
            label: 'Conciliación bancaria',
            icon: Banknote,
            requiredPermission: PERMISSIONS.contabilidad.conciliacion.read,
            vertical: 'CONTABILIDAD',
            pack: 'contabilidad.conciliacion',
          },
          {
            to: '/settings/cuentas-bancarias',
            label: 'Cuentas bancarias',
            icon: Wallet,
            requiredPermission: PERMISSIONS.contabilidad.conciliacion.read,
            vertical: 'CONTABILIDAD',
            pack: 'contabilidad.conciliacion',
          },
          // REQ-ICB-01..09: el puente saldo extracto ± partidas = saldo libros
          // como papel de trabajo. Consultar es lectura (D7) — misma cascada
          // permiso ∧ vertical ∧ pack que el resto del grupo.
          {
            to: '/conciliacion/informe',
            label: 'Informe de conciliación',
            icon: ClipboardCheck,
            requiredPermission: PERMISSIONS.contabilidad.conciliacion.read,
            vertical: 'CONTABILIDAD',
            pack: 'contabilidad.conciliacion',
          },
        ],
      },
      {
        id: 'maestros',
        label: 'Maestros',
        icon: FolderOpen,
        items: [
          {
            to: '/plan-cuentas',
            label: 'Plan de cuentas',
            icon: BookOpen,
            requiredPermission: PERMISSIONS.contabilidad.planCuentas.read,
            vertical: 'CONTABILIDAD',
          },
          {
            to: '/contactos',
            label: 'Contactos',
            icon: Contact,
            requiredPermission: PERMISSIONS.contabilidad.contactos.read,
            vertical: 'CONTABILIDAD',
          },
          {
            to: '/documentos-fisicos',
            label: 'Documentos físicos',
            icon: FileStack,
            requiredPermission: PERMISSIONS.contabilidad.documentosFisicos.read,
            vertical: 'CONTABILIDAD',
          },
        ],
      },
    ],
    // Suelto abajo: una vez al año y de alto impacto — visible, pero sin
    // competir con el uso diario por el lugar de arriba.
    trailingItems: [
      {
        to: '/gestiones/cierre',
        label: 'Cierre del ejercicio',
        icon: BookCheck,
        requiredPermission: PERMISSIONS.contabilidad.gestiones.read,
        vertical: 'CONTABILIDAD',
      },
    ],
  },
  // ─── Granja (vertical GRANJA) ──────────────────────────────────────────────
  // Visibilidad: RBAC + vertical (gating aditivo). Si el tenant activó granja,
  // el backend otorga granja.* y has('granja.X.read') da true. El filtro de
  // vertical asegura que solo se muestran cuando vertical === 'GRANJA'.
  {
    id: 'granja',
    label: 'Granja',
    kind: 'modulo',
    items: [
      {
        to: '/granja',
        label: 'Dashboard',
        icon: LayoutDashboard,
        requiredPermission: PERMISSIONS.granja.dashboard.read,
        vertical: 'GRANJA',
      },
      {
        to: '/granja/lotes',
        label: 'Mis Lotes',
        icon: Bird,
        requiredPermission: PERMISSIONS.granja.lotes.read,
        vertical: 'GRANJA',
      },
      {
        to: '/granja/tipos-registro',
        label: 'Tipos de Registro',
        icon: ClipboardList,
        requiredPermission: PERMISSIONS.granja.tiposRegistro.read,
        vertical: 'GRANJA',
      },
    ],
  },
  // ─── Administración (cross-vertical — sin campo vertical) ──────────────────
  {
    id: 'administracion',
    label: 'Administración',
    kind: 'transversal',
    items: [
      {
        to: '/settings/empresa',
        label: 'Datos de la empresa',
        icon: Building2,
        requiredPermission: PERMISSIONS.organizacion.configuracion.read,
      },
      {
        to: '/settings/members',
        label: 'Miembros',
        icon: Users,
        requiredPermission: PERMISSIONS.organizacion.miembros.read,
      },
      {
        to: '/settings/roles',
        label: 'Roles',
        icon: Shield,
        requiredPermission: PERMISSIONS.organizacion.roles.read,
      },
      {
        to: '/settings/features',
        label: 'Módulos activos',
        icon: ToggleRight,
        requiredPermission: PERMISSIONS.organizacion.featureFlags.read,
      },
      {
        to: '/settings/complementos',
        label: 'Complementos',
        icon: Boxes,
        // Sin requiredPermission: el gating es por SystemRole, no por permiso RBAC.
        // La pantalla de gestión de packs no se gatea por pack (sería circular —
        // el Owner necesita entrar para ACTIVAR el pack; gatearlo sería un deadlock).
        requiredSystemRole: ['OWNER', 'ADMIN'] as SystemRole[],
      },
    ],
  },
  // ─── Configuración (cross-vertical) ───────────────────────────────────────
  {
    id: 'configuracion',
    label: 'Configuración',
    kind: 'transversal',
    items: [
      {
        to: '/periodos-fiscales',
        label: 'Períodos fiscales',
        icon: CalendarRange,
        requiredPermission: PERMISSIONS.contabilidad.periodos.read,
        vertical: 'CONTABILIDAD',
      },
      {
        to: '/tipos-documento-fisico',
        label: 'Tipos de documento',
        icon: FileBadge,
        requiredPermission: PERMISSIONS.contabilidad.tiposDocumento.read,
        vertical: 'CONTABILIDAD',
      },
      // NOTA: "Cuentas bancarias" NO vive acá. Se movió al grupo `bancos` de
      // Contabilidad junto al resto del pack `contabilidad.conciliacion`.
      // Configuración contable: ítem deshabilitado, pertenece a CONTABILIDAD.
      // Lleva vertical: 'CONTABILIDAD' para que el granjero no lo vea aunque esté disabled.
      {
        to: '/configuracion',
        label: 'Configuración contable',
        icon: Settings,
        disabled: true,
        vertical: 'CONTABILIDAD',
      },
    ],
  },
];

// Export derivado para retrocompat de tests (guards anti-drift) y para que
// los consumidores que iteran el universo completo de ítems sigan funcionando.
// Aplana en el MISMO orden en que NavList renderiza:
// grupos iniciales → sueltos → grupos → finales (REQ-SB-16).
// NavList itera NAV_SECTIONS directo (no este derivado) — D-05.
export const NAV_ITEMS: NavItem[] = [
  PANEL_ITEM,
  ...NAV_SECTIONS.flatMap((s) => [
    ...(s.leadingGroups ?? []).flatMap((g) => g.items),
    ...s.items,
    ...(s.groups ?? []).flatMap((g) => g.items),
    ...(s.trailingItems ?? []),
  ]),
];
