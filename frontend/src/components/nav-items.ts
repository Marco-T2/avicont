import {
  Bird,
  BookMarked,
  BookOpen,
  BookText,
  Building2,
  CalendarRange,
  ClipboardList,
  Contact,
  FileBadge,
  FileStack,
  FileText,
  Home,
  LayoutDashboard,
  Scale,
  Settings,
  Shield,
  ToggleRight,
  TrendingUp,
  Users,
} from 'lucide-react';

import { PERMISSIONS } from '@/lib/permissions';

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
}

// Única fuente de verdad del menú principal. Consumida por AppSidebar
// (desktop, fijo) y MobileSidebar (drawer). Para agregar un módulo, meterlo
// acá y ambos modos lo reflejan automáticamente.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Panel', icon: Home },
  {
    to: '/plan-cuentas',
    label: 'Plan de cuentas',
    icon: BookOpen,
    requiredPermission: PERMISSIONS.contabilidad.planCuentas.read,
    vertical: 'CONTABILIDAD',
  },
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
    to: '/eeff/resultados',
    label: 'Estado de Resultados',
    icon: TrendingUp,
    requiredPermission: PERMISSIONS.contabilidad.eeff.read,
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
    to: '/tipos-documento-fisico',
    label: 'Tipos de documento',
    icon: FileBadge,
    requiredPermission: PERMISSIONS.contabilidad.tiposDocumento.read,
    vertical: 'CONTABILIDAD',
  },
  {
    to: '/documentos-fisicos',
    label: 'Documentos físicos',
    icon: FileStack,
    requiredPermission: PERMISSIONS.contabilidad.documentosFisicos.read,
    vertical: 'CONTABILIDAD',
  },
  {
    to: '/periodos-fiscales',
    label: 'Períodos fiscales',
    icon: CalendarRange,
    requiredPermission: PERMISSIONS.contabilidad.periodos.read,
    vertical: 'CONTABILIDAD',
  },
  // ─── Administración (cross-vertical — sin campo vertical) ──────────────────
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
  // Configuración contable: ítem deshabilitado, pertenece a CONTABILIDAD.
  // Lleva vertical: 'CONTABILIDAD' para que el granjero no lo vea aunque esté disabled.
  { to: '/configuracion', label: 'Configuración contable', icon: Settings, disabled: true, vertical: 'CONTABILIDAD' },
  // ─── Granja ────────────────────────────────────────────────────────────────
  // Visibilidad: RBAC + vertical (gating aditivo). Si el tenant activó granja,
  // el backend otorga granja.* y has('granja.X.read') da true. El filtro de
  // vertical asegura que solo se muestran cuando vertical === 'GRANJA'.
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
];
