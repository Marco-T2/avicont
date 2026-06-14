import { useMemo } from 'react';

import { NavLink } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMisPacks } from '@/lib/use-packs';
import { usePermissions } from '@/lib/use-permissions';
import { useVerticalActivo } from '@/lib/use-vertical';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import type { SystemRole } from '@/types/api';

import { NAV_SECTIONS, PANEL_ITEM, type NavItem, type NavSection } from './nav-items';

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
  // Leer `user.roles` UNA vez (selector estable — Anti-F-15).
  // NO llamar useHasSystemRole por-item: rompe reglas de hooks.
  // El `?? false` va afuera del selector (Anti-F-15: evita array nuevo en cada render).
  const userRoles = useAuthStore((s) => s.user?.roles);

  // Cascada AND fail-closed — MISMA lógica que la versión plana, movida a closure.
  const pasaFiltro = (item: NavItem): boolean => {
    const pasaPermiso = item.requiredPermission === undefined || has(item.requiredPermission);
    const pasaVertical = item.vertical === undefined || item.vertical === verticalActivo;
    const pasaPack =
      item.pack === undefined || (packsActivos?.includes(item.pack) ?? false);
    const pasaSystemRole =
      item.requiredSystemRole === undefined ||
      (userRoles?.some((r) => item.requiredSystemRole!.includes(r as SystemRole)) ?? false);
    return pasaPermiso && pasaVertical && pasaPack && pasaSystemRole;
  };

  // Por sección, computar ítems visibles y descartar secciones vacías (no header huérfano).
  const seccionesVisibles = useMemo(
    () =>
      NAV_SECTIONS.map((s) => ({ section: s, visibleItems: s.items.filter(pasaFiltro) })).filter(
        (s) => s.visibleItems.length > 0,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [has, verticalActivo, packsActivos, userRoles],
  );

  // Contar módulos visibles para decidir el header adaptativo (D-03).
  const modulosVisibles = useMemo(
    () => seccionesVisibles.filter((s) => s.section.kind === 'modulo').length,
    [seccionesVisibles],
  );

  // ¿Mostrar el header de ESTA sección?
  // - collapsed → nunca (riel de 64px)
  // - transversal con ítems → SÍ (sección ya garantiza ≥1 ítem visible)
  // - modulo → SÍ solo si hay ≥2 módulos visibles (contraste visual)
  const debeMostrarHeader = (section: NavSection): boolean => {
    if (collapsed) return false;
    if (section.kind === 'transversal') return true;
    return modulosVisibles >= 2;
  };

  return (
    <nav className="flex-1 space-y-1 p-2">
      {/* Ítem suelto Panel — siempre arriba, sin header (D-01). */}
      <NavItemSlot item={PANEL_ITEM} onItemClick={onItemClick} collapsed={collapsed} />

      {seccionesVisibles.map(({ section, visibleItems }, idx) => (
        <div key={section.id} className="space-y-1">
          {debeMostrarHeader(section) && (
            <h2 className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </h2>
          )}
          {/* Collapsed: divider sutil ENTRE bloques (no antes del primero) en vez de header (D-08 / OQ-2). */}
          {collapsed && idx > 0 && (
            <div className="mx-2 my-1 border-t border-sidebar-border" aria-hidden="true" />
          )}
          {visibleItems.map((item) => (
            <NavItemSlot key={item.to} item={item} onItemClick={onItemClick} collapsed={collapsed} />
          ))}
        </div>
      ))}
    </nav>
  );
}

interface SlotProps {
  item: NavItem;
  onItemClick?: (() => void) | undefined;
  collapsed: boolean | undefined;
}

// NavItemSlot — extracción del bloque div-vs-Tooltip (D-07).
// Reusado tanto para PANEL_ITEM como para los ítems de cada sección.
// NavItemRenderer (abajo) NO se toca.
function NavItemSlot({ item, onItemClick, collapsed }: SlotProps): React.JSX.Element {
  const trigger = (
    <NavItemRenderer item={item} onItemClick={onItemClick} collapsed={collapsed ?? false} />
  );
  // Tooltip SOLO cuando colapsado — con el label visible sería ruido.
  if (!collapsed) return <div key={item.to}>{trigger}</div>;
  return (
    <Tooltip key={item.to}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
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
