import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { NAV_ITEMS } from './nav-items';

interface NavListProps {
  // Callback opcional para cerrar el drawer mobile al clickear un item.
  // En desktop no se pasa y el sidebar queda fijo.
  onItemClick?: () => void;
}

export function NavList({ onItemClick }: NavListProps): React.JSX.Element {
  return (
    <nav className="flex-1 space-y-1 p-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        if (item.disabled === true) {
          return (
            <span
              key={item.to}
              className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-3 text-sm text-muted-foreground/60 md:py-2"
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
            onClick={onItemClick}
            // py-3 en mobile asegura tap target ≥44px (CLAUDE.md §7),
            // py-2 en md+ para densidad más alta en desktop.
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-3 text-sm transition-colors md:py-2',
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
  );
}
