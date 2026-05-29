import {
  BookOpen,
  CalendarRange,
  Contact,
  FileBadge,
  FileStack,
  FileText,
  Home,
  Settings,
  Shield,
  ToggleRight,
  Users,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

// Única fuente de verdad del menú principal. Consumida por AppSidebar
// (desktop, fijo) y MobileSidebar (drawer). Para agregar un módulo, meterlo
// acá y ambos modos lo reflejan automáticamente.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Panel', icon: Home },
  { to: '/plan-cuentas', label: 'Plan de cuentas', icon: BookOpen },
  { to: '/comprobantes', label: 'Comprobantes', icon: FileText },
  { to: '/contactos', label: 'Contactos', icon: Contact },
  { to: '/tipos-documento-fisico', label: 'Tipos de documento', icon: FileBadge },
  { to: '/documentos-fisicos', label: 'Documentos físicos', icon: FileStack },
  { to: '/periodos-fiscales', label: 'Períodos fiscales', icon: CalendarRange },
  { to: '/settings/members', label: 'Miembros', icon: Users },
  { to: '/settings/roles', label: 'Roles', icon: Shield },
  { to: '/settings/features', label: 'Módulos activos', icon: ToggleRight },
  { to: '/configuracion', label: 'Configuración contable', icon: Settings, disabled: true },
];
