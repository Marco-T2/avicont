import { Building2, LogOut, Menu, Shield, ToggleRight } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

interface PlatformNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Navegación propia del panel de plataforma (NO el NAV_ITEMS del dashboard de
// tenant): plana, sin vertical/permiso, sin org-switcher. El shell entero vive
// detrás de RequireSuperAdmin, así que estos ítems solo los ve un super-admin.
const PLATFORM_NAV_ITEMS: PlatformNavItem[] = [
  { to: '/platform-admin/orgs', label: 'Organizaciones', icon: Building2 },
  { to: '/platform-admin/feature-flags', label: 'Feature flags', icon: ToggleRight },
];

function PlatformNavList({ onItemClick }: { onItemClick?: () => void }): React.JSX.Element {
  return (
    <nav className="flex-1 space-y-1 p-2">
      {PLATFORM_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onItemClick}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-3 text-sm transition-colors md:py-2',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function PlatformBrand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-sidebar-foreground">
      <Shield className="h-5 w-5 text-primary" />
      <span className="text-base font-semibold tracking-tight">Plataforma</span>
    </div>
  );
}

/**
 * Layout del panel de plataforma. Independiente de DashboardShell:
 * SIN org-switcher ni contexto de tenant (el super-admin opera cross-tenant).
 * Marcado visualmente como "Plataforma" para que sea obvio que no es un tenant.
 */
export function PlatformShell(): React.JSX.Element {
  const clear = useAuthStore((s) => s.clear);
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // "Volver a la app" solo tiene sentido si el SA tiene un tenant activo. Sin
  // tenant, IndexRedirect rebota / → /platform-admin → el botón no haría nada.
  const puedeVolverALaApp = activeTenantId !== undefined;

  async function handleLogout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Silencioso: aun si el backend rechaza, limpiamos en memoria.
    }
    clear();
    toast.success('Sesión cerrada');
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <PlatformBrand />
        </div>
        <PlatformNavList />
        {puedeVolverALaApp ? (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="w-full justify-start gap-2 text-muted-foreground"
            >
              <NavLink to="/">
                <LogOut className="h-4 w-4 rotate-180" />
                <span className="text-xs">Volver a la app</span>
              </NavLink>
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-3 md:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {/* Drawer mobile */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Abrir menú de navegación"
                  className="h-11 w-11 md:hidden"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-sidebar p-0">
                <SheetHeader className="border-b">
                  <SheetTitle className="text-left">
                    <PlatformBrand />
                  </SheetTitle>
                </SheetHeader>
                <PlatformNavList onItemClick={() => setDrawerOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="truncate text-sm text-muted-foreground md:hidden">Plataforma</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 md:gap-2">
            {puedeVolverALaApp ? (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="hidden sm:inline-flex"
              >
                <NavLink to="/">Volver a la app</NavLink>
              </Button>
            ) : null}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              className="h-11 w-11 sm:h-9 sm:w-auto sm:px-3"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
