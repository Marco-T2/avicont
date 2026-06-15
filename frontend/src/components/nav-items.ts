import {
  Bird,
  BookMarked,
  BookOpen,
  BookText,
  Boxes,
  Building2,
  CalendarRange,
  ClipboardList,
  Contact,
  FileBadge,
  FileStack,
  FileText,
  Home,
  LayoutDashboard,
  ListChecks,
  Scale,
  Settings,
  Shield,
  ToggleRight,
  TrendingUp,
  Users,
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
  /** Ítems de la sección. El gating sigue siendo por ítem (cada uno declara su gate). */
  items: NavItem[];
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
    items: [
      {
        to: '/comprobantes',
        label: 'Comprobantes',
        icon: FileText,
        requiredPermission: PERMISSIONS.contabilidad.asientos.read,
        vertical: 'CONTABILIDAD',
      },
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
        to: '/eeff/resultados',
        label: 'Estado de Resultados',
        icon: TrendingUp,
        requiredPermission: PERMISSIONS.contabilidad.eeff.read,
        vertical: 'CONTABILIDAD',
      },
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
        requiredPermission: PERMISSIONS.organizacion.features.read,
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
// NavList itera NAV_SECTIONS directo (no este derivado) — D-05.
export const NAV_ITEMS: NavItem[] = [PANEL_ITEM, ...NAV_SECTIONS.flatMap((s) => s.items)];
