import { BookOpen, Home, Settings } from 'lucide-react';

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
  { to: '/configuracion', label: 'Configuración contable', icon: Settings, disabled: true },
];
