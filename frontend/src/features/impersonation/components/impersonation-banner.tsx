import { AlertTriangle, Loader2, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { backendErrorMessage } from '@/lib/error-messages';
import { useAuthStore } from '@/stores/auth-store';

import { useEndImpersonation } from '../hooks/use-impersonation';

// Banner global que aparece mientras `authStore.user.impersonatedBy` está
// seteado. Renderizado en DashboardShell; el resto de la app no necesita
// saber que está impersonando.
export function ImpersonationBanner(): React.JSX.Element | null {
  const user = useAuthStore((s) => s.user);
  const mutation = useEndImpersonation();
  const navigate = useNavigate();

  if (user === null || user.impersonatedBy === undefined) {
    return null;
  }

  function handleEnd(): void {
    mutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result === 'restored') {
          toast.success('Impersonation terminada — volvés a tu cuenta de admin');
          navigate('/', { replace: true });
        } else {
          toast.info('Sesión cerrada — iniciá sesión nuevamente');
          navigate('/login', { replace: true });
        }
      },
      onError: (err) => {
        toast.error(
          backendErrorMessage(err, 'No se pudo cerrar la sesión de impersonation'),
        );
      },
    });
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-destructive">
            Estás operando como {user.email}
          </p>
          <p className="text-xs text-muted-foreground">
            Toda acción queda registrada. La sesión expira a los 30 minutos.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleEnd}
        disabled={mutation.isPending}
        className="self-start sm:self-auto"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Cerrando…
          </>
        ) : (
          <>
            <LogOut className="h-4 w-4 mr-2" />
            Salir de impersonation
          </>
        )}
      </Button>
    </div>
  );
}
