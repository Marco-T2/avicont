import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { MobileSidebar } from '@/components/mobile-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

export function Topbar(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  async function handleLogout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Silencioso: incluso si el backend rechaza, limpiamos en memoria
      // y al siguiente request el usuario quedará logged out.
    }
    clear();
    toast.success('Sesión cerrada');
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-3 md:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger solo en mobile; abre el drawer con la nav completa. */}
        <MobileSidebar />
        {/* truncate + title para emails largos — evita que desborde en 375px. */}
        <span
          className="truncate text-sm font-medium max-w-[180px] sm:max-w-xs md:max-w-md"
          title={user?.email ?? 'Sin sesión'}
        >
          {user?.email ?? 'Sin sesión'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
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
