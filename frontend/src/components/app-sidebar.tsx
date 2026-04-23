import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSidebarShortcut, useSidebarStore } from '@/stores/sidebar-store';

import { NavList } from './nav-list';

// Sidebar de desktop, fija en md+. En mobile queda oculta (usa MobileSidebar).
//
// Estado `collapsed` persistido en Zustand + localStorage (useSidebarStore).
// Shortcut: Ctrl+B / Cmd+B — toggle rápido desde cualquier pantalla (el hook
// ignora cuando el foco está en un input/textarea/editable para no chocar
// con el "bold" de editores).
//
// Transición: `transition-[width]` de 200ms suaviza el cambio de ancho.
export function AppSidebar(): React.JSX.Element {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  useSidebarShortcut();

  return (
    <aside
      className={cn(
        'hidden shrink-0 border-r bg-sidebar md:flex md:flex-col',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center border-b px-4">
        <span
          className={cn(
            'text-base font-semibold tracking-tight text-sidebar-foreground',
            collapsed && 'mx-auto',
          )}
          aria-label="Avicont"
        >
          {collapsed ? 'A' : 'Avicont'}
        </span>
      </div>

      <NavList collapsed={collapsed} />

      <div className="border-t p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              aria-label={collapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
              className={cn(
                'w-full gap-2 text-muted-foreground',
                collapsed && 'justify-center',
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4" />
                  <span className="text-xs">Contraer</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? 'Expandir' : 'Contraer'} sidebar
            <kbd className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              Ctrl+B
            </kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
