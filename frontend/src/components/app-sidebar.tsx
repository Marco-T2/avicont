import { Home, BookOpen, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';

// Sidebar fija de la app. Por ahora solo "Panel" está activo; los otros
// items quedan como placeholders con cursor-not-allowed hasta que llegue
// su fase correspondiente. Se activan editando la propiedad `disabled`.
interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'Panel', icon: Home },
  { to: '/plan-cuentas', label: 'Plan de cuentas', icon: BookOpen, disabled: true },
  { to: '/configuracion', label: 'Configuración contable', icon: Settings, disabled: true },
];

export function AppSidebar(): React.JSX.Element {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
          Avicont
        </span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          if (item.disabled === true) {
            return (
              <span
                key={item.to}
                className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
                title="Disponible en una fase posterior"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
