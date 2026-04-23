import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {user?.email ?? 'Sin sesión'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}
