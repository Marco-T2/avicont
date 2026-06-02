import { NavLink } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMisPacks } from '@/lib/use-packs';
import { usePermissions } from '@/lib/use-permissions';
import { useVerticalActivo } from '@/lib/use-vertical';
import { cn } from '@/lib/utils';

import { NAV_ITEMS, type NavItem } from './nav-items';

interface NavListProps {
  /** Callback opcional para cerrar el drawer mobile al clickear un item. */
  onItemClick?: () => void;
  /** Si true, oculta labels y muestra tooltip. Solo aplica en sidebar desktop. */
  collapsed?: boolean;
}

export function NavList({
  onItemClick,
  collapsed = false,
}: NavListProps): React.JSX.Element {
  // Filtrado AND por permiso Y vertical Y pack (aditivos, independientes).
  // has() es fail-closed (false durante loading) → los ítems con requiredPermission
  // permanecen ocultos hasta que carguen los permisos.
  // Filtro de vertical: fail-closed por comparación estricta —
  //   undefined === 'CONTABILIDAD' → false (cargando: ocultar ítems con vertical)
  //   null === 'GRANJA' → false (sin módulo: ocultar ítems con vertical)
  // Items sin `vertical` (administración cross-vertical) siempre pasan.
  // Filtro de pack (eje 2): fail-closed —
  //   packsActivos undefined (cargando) → ocultar ítems con `pack` (no parpadean).
  //   Items sin `pack` siempre pasan (igual que los sin `vertical`).
  const { has } = usePermissions();
  const { vertical: verticalActivo } = useVerticalActivo();
  const { packsActivos } = useMisPacks();
  const visibleItems = NAV_ITEMS.filter((item) => {
    const pasaPermiso = item.requiredPermission === undefined || has(item.requiredPermission);
    const pasaVertical = item.vertical === undefined || item.vertical === verticalActivo;
    const pasaPack =
      item.pack === undefined || (packsActivos?.includes(item.pack) ?? false);
    return pasaPermiso && pasaVertical && pasaPack;
  });

  return (
    <nav className="flex-1 space-y-1 p-2">
      {visibleItems.map((item) => {
        const trigger = (
          <NavItemRenderer item={item} onItemClick={onItemClick} collapsed={collapsed} />
        );
        // Tooltip SOLO cuando colapsado — con el label visible sería ruido.
        if (!collapsed) return <div key={item.to}>{trigger}</div>;
        return (
          <Tooltip key={item.to}>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

interface ItemProps {
  item: NavItem;
  onItemClick?: (() => void) | undefined;
  collapsed: boolean;
}

function NavItemRenderer({ item, onItemClick, collapsed }: ItemProps): React.JSX.Element {
  const Icon = item.icon;
  // Clases comunes a disabled y NavLink — cambia el layout según collapsed.
  const base = cn(
    'flex items-center gap-2 rounded-md text-sm transition-colors',
    collapsed ? 'justify-center p-3 md:p-2' : 'px-3 py-3 md:py-2',
  );

  if (item.disabled === true) {
    return (
      <span
        className={cn(base, 'cursor-not-allowed text-muted-foreground/60')}
        aria-disabled="true"
        aria-label={collapsed ? item.label : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      end
      onClick={onItemClick}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          base,
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}
