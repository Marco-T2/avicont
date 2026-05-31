import {
  BookMarked,
  BookOpen,
  BookText,
  CalendarRange,
  Contact,
  FileBadge,
  FileStack,
  FileText,
  Home,
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
  { to: '/plan-cuentas', label: 'Plan de cuentas', icon: BookOpen },
  { to: '/comprobantes', label: 'Comprobantes', icon: FileText },
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
  { to: '/contactos', label: 'Contactos', icon: Contact },
  { to: '/tipos-documento-fisico', label: 'Tipos de documento', icon: FileBadge },
  { to: '/documentos-fisicos', label: 'Documentos físicos', icon: FileStack },
  { to: '/periodos-fiscales', label: 'Períodos fiscales', icon: CalendarRange },
  { to: '/settings/members', label: 'Miembros', icon: Users },
  { to: '/settings/roles', label: 'Roles', icon: Shield },
  { to: '/settings/features', label: 'Módulos activos', icon: ToggleRight },
  { to: '/configuracion', label: 'Configuración contable', icon: Settings, disabled: true },
];
