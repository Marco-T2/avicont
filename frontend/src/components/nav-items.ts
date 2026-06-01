import {
  Bird,
  BookMarked,
  BookOpen,
  BookText,
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
  },
  {
    to: '/comprobantes',
    label: 'Comprobantes',
    icon: FileText,
    requiredPermission: PERMISSIONS.contabilidad.asientos.read,
  },
  {
    to: '/libros/diario',
    label: 'Libro Diario',
    icon: BookText,
    requiredPermission: PERMISSIONS.contabilidad.libroDiario.read,
  },
  {
    to: '/libros/mayor',
    label: 'Libro Mayor',
    icon: BookMarked,
    requiredPermission: PERMISSIONS.contabilidad.libroMayor.read,
  },
  {
    to: '/eeff/balance',
    label: 'Balance General',
    icon: Scale,
    requiredPermission: PERMISSIONS.contabilidad.eeff.read,
  },
  {
    to: '/eeff/resultados',
    label: 'Estado de Resultados',
    icon: TrendingUp,
    requiredPermission: PERMISSIONS.contabilidad.eeff.read,
  },
  {
    to: '/contactos',
    label: 'Contactos',
    icon: Contact,
    requiredPermission: PERMISSIONS.contabilidad.contactos.read,
  },
  {
    to: '/tipos-documento-fisico',
    label: 'Tipos de documento',
    icon: FileBadge,
    requiredPermission: PERMISSIONS.contabilidad.tiposDocumento.read,
  },
  {
    to: '/documentos-fisicos',
    label: 'Documentos físicos',
    icon: FileStack,
    requiredPermission: PERMISSIONS.contabilidad.documentosFisicos.read,
  },
  {
    to: '/periodos-fiscales',
    label: 'Períodos fiscales',
    icon: CalendarRange,
    requiredPermission: PERMISSIONS.contabilidad.periodos.read,
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
  { to: '/configuracion', label: 'Configuración contable', icon: Settings, disabled: true },
  // ─── Granja ────────────────────────────────────────────────────────────────
  // Visibilidad: 100% RBAC. Si el tenant activó granja, el backend otorga
  // granja.* y has('granja.X.read') da true. Sin flag granjaEnabled en store.
  {
    to: '/granja',
    label: 'Dashboard',
    icon: LayoutDashboard,
    requiredPermission: PERMISSIONS.granja.dashboard.read,
  },
  {
    to: '/granja/lotes',
    label: 'Mis Lotes',
    icon: Bird,
    requiredPermission: PERMISSIONS.granja.lotes.read,
  },
  {
    to: '/granja/tipos-registro',
    label: 'Tipos de Registro',
    icon: ClipboardList,
    requiredPermission: PERMISSIONS.granja.tiposRegistro.read,
  },
];
