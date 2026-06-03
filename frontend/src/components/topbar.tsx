import { LogOut } from 'lucide-react';

import { MobileSidebar } from '@/components/mobile-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { PlatformPanelLink } from '@/features/platform-admin/components/platform-panel-link';
import { OrgSwitcher } from '@/features/tenants/components/org-switcher';
import { useLogout } from '@/features/auth/use-logout';

export function Topbar(): React.JSX.Element {
  const handleLogout = useLogout();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-3 md:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger solo en mobile; abre el drawer con la nav completa. */}
        <MobileSidebar />
        {/* OrgSwitcher reemplaza al span del email: muestra la org activa
            con iniciales + rol, dropdown para cambiar. El email del user
            sigue accesible decodificando el JWT en auth-store (ver futuro
            "User menu" cuando agreguemos /settings/profile). */}
        <OrgSwitcher />
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        {/* Solo visible para super-admins: acceso al panel de plataforma. */}
        <PlatformPanelLink />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          // Icon-only en mobile con tap target h-11 w-11 (44px, Apple HIG §7);
          // full label desde sm+ con height estándar shadcn.
          className="h-11 w-11 sm:h-9 sm:w-auto sm:px-3"
        >
          <LogOut className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Cerrar sesión</span>
        </Button>
      </div>
    </header>
  );
}
