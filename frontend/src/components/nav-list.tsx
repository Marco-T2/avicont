import { useMemo, useState } from 'react';

import { ChevronRight } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMisPacks } from '@/lib/use-packs';
import { usePermissions } from '@/lib/use-permissions';
import { useVerticalActivo } from '@/lib/use-vertical';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useSidebarStore } from '@/stores/sidebar-store';
import type { SystemRole } from '@/types/api';

import {
  NAV_SECTIONS,
  PANEL_ITEM,
  type NavGroup,
  type NavItem,
  type NavSection,
} from './nav-items';

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

  // Por sección: ítems sueltos + grupos + sueltos finales, ya filtrados.
  // Un GRUPO sin ítems visibles se descarta entero (no queda header huérfano) —
  // misma regla que ya se aplicaba a las secciones. Por eso el grupo no necesita
  // declarar gate propio: su visibilidad se DERIVA de la cascada de sus ítems.
  const seccionesVisibles = useMemo(
    () =>
      NAV_SECTIONS.map((s) => {
        // leadingGroups pasa por el MISMO pipeline que groups: un solo predicado
        // y un solo colapso-a-cero, para que no existan dos mecanismos de grupo.
        const filtrarGrupos = (grupos: NavGroup[] | undefined) =>
          (grupos ?? [])
            .map((g) => ({ group: g, visibleItems: g.items.filter(pasaFiltro) }))
            .filter((g) => g.visibleItems.length > 0);
        const leadingGroups = filtrarGrupos(s.leadingGroups);
        const looseItems = s.items.filter(pasaFiltro);
        const groups = filtrarGrupos(s.groups);
        const trailingItems = (s.trailingItems ?? []).filter(pasaFiltro);
        // El total DEBE contar leadingGroups: sin eso, una sección cuyo único
        // contenido visible fuera un grupo inicial desaparecería entera.
        const total =
          leadingGroups.reduce((n, g) => n + g.visibleItems.length, 0) +
          looseItems.length +
          groups.reduce((n, g) => n + g.visibleItems.length, 0) +
          trailingItems.length;
        return { section: s, leadingGroups, looseItems, groups, trailingItems, total };
      }).filter((s) => s.total > 0),
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
    // `min-h-0` + `overflow-y-auto`: el shell monta la sidebar dentro de un
    // `flex h-screen`. Sin min-h-0 un hijo flex nunca baja de su content height,
    // el overflow no se activa y lo que sobra queda FUERA del viewport, sin
    // scroll de página (el root es h-screen) → ítems inalcanzables.
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {/* Ítem suelto Panel — siempre arriba, sin header (D-01). */}
      <NavItemSlot item={PANEL_ITEM} onItemClick={onItemClick} collapsed={collapsed} />

      {seccionesVisibles.map(({ section, leadingGroups, looseItems, groups, trailingItems }, idx) => (
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

          {/* Orden de render (REQ-SB-16): leadingGroups → items → groups → trailingItems. */}
          {leadingGroups.map(({ group, visibleItems }) => (
            <NavGroupSlot
              key={group.id}
              group={group}
              visibleItems={visibleItems}
              onItemClick={onItemClick}
              collapsed={collapsed}
            />
          ))}

          {looseItems.map((item) => (
            <NavItemSlot key={item.to} item={item} onItemClick={onItemClick} collapsed={collapsed} />
          ))}

          {groups.map(({ group, visibleItems }) => (
            <NavGroupSlot
              key={group.id}
              group={group}
              visibleItems={visibleItems}
              onItemClick={onItemClick}
              collapsed={collapsed}
            />
          ))}

          {trailingItems.map((item) => (
            <NavItemSlot key={item.to} item={item} onItemClick={onItemClick} collapsed={collapsed} />
          ))}
        </div>
      ))}
    </nav>
  );
}

interface GroupProps {
  group: NavGroup;
  visibleItems: NavItem[];
  onItemClick?: (() => void) | undefined;
}

// Selector único Rail/Block para leadingGroups Y groups: las dos colecciones
// comparten los mismos componentes de grupo — un segundo mecanismo habría que
// mantenerlo sincronizado con el primero.
function NavGroupSlot({
  collapsed,
  ...props
}: GroupProps & { collapsed: boolean }): React.JSX.Element {
  return collapsed ? <NavGroupRail {...props} /> : <NavGroupBlock {...props} />;
}

// Prefijo, no igualdad: en /conciliacion/:id el grupo sigue contando como
// activo aunque el NavLink (que usa `end`) ya no se pinte como tal.
function contieneRuta(items: NavItem[], pathname: string): boolean {
  return items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
}

// Subgrupo colapsable. Solo se renderiza en modo expandido.
//
// Default de apertura: abierto si contiene la ruta activa, cerrado si no. Ese
// default se pisa con la preferencia guardada del usuario — incluido el caso
// "cerré a propósito el grupo donde estoy parado", por eso `openGroups` guarda
// booleanos y no un set de abiertos.
function NavGroupBlock({ group, visibleItems, onItemClick }: GroupProps): React.JSX.Element {
  const { pathname } = useLocation();
  const openGroups = useSidebarStore((s) => s.openGroups);
  const toggleGroup = useSidebarStore((s) => s.toggleGroup);

  const contieneRutaActiva = contieneRuta(visibleItems, pathname);
  const abierto = openGroups[group.id] ?? contieneRutaActiva;
  const contentId = `nav-group-${group.id}`;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => toggleGroup(group.id, contieneRutaActiva)}
        aria-expanded={abierto}
        aria-controls={contentId}
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-3 py-1.5 pointer-coarse:min-h-11',
          'text-xs font-semibold uppercase tracking-wide transition-colors',
          'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          // Plegado pero con la ruta activa adentro: sin esta pista el usuario
          // pierde de vista dónde está parado.
          !abierto && contieneRutaActiva
            ? 'text-sidebar-accent-foreground'
            : 'text-muted-foreground',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
            abierto && 'rotate-90',
          )}
          aria-hidden="true"
        />
        <span className="flex-1 text-left">{group.label}</span>
        <span className="text-[10px] font-normal tabular-nums opacity-60" aria-hidden="true">
          {visibleItems.length}
        </span>
      </button>

      {abierto && (
        <div id={contentId} className="ml-4 space-y-1 border-l border-sidebar-border pl-1">
          {visibleItems.map((item) => (
            <NavItemSlot key={item.to} item={item} onItemClick={onItemClick} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// Versión del subgrupo para el RIEL de 64px: el grupo colapsa a UN icono que
// abre un flyout con sus ítems.
//
// Por qué no aplanar los grupos a iconos sueltos: el riel quedaba con 25 iconos
// —los mismos de antes de agrupar— desbordando el viewport, y contraído no se
// distingue Balance General de Balance de Comprobación sin hoverear los dos.
// Con flyout son 15 blancos y el agrupamiento sobrevive al modo riel.
//
// Por click y no por hover: accesible por teclado y no se abren solos mientras
// movés el mouse por el riel. `openGroups` (plegado del modo expandido) NO se
// consulta acá: son dos modelos de interacción distintos.
function NavGroupRail({ group, visibleItems, onItemClick }: GroupProps): React.JSX.Element {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const Icon = group.icon;
  const contieneRutaActiva = contieneRuta(visibleItems, pathname);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={group.label}
          // Marca dónde estás parado: en el riel el ítem activo está escondido
          // adentro del flyout, así que la pista tiene que darla el grupo.
          {...(contieneRutaActiva ? { 'aria-current': 'true' as const } : {})}
          className={cn(
            'flex w-full items-center justify-center rounded-md p-2 transition-colors',
            'pointer-coarse:min-h-11 pointer-coarse:min-w-11',
            contieneRutaActiva
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-56 gap-1 p-1"
        aria-label={group.label}
      >
        <p className="px-3 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {group.label}
        </p>
        {visibleItems.map((item) => (
          <NavItemRenderer
            key={item.to}
            item={item}
            onItemClick={() => {
              setOpen(false);
              onItemClick?.();
            }}
            collapsed={false}
          />
        ))}
      </PopoverContent>
    </Popover>
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
    collapsed
      ? 'justify-center p-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11'
      : 'px-3 py-2 pointer-coarse:min-h-11',
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
