import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/lib/use-permissions';

interface RequirePermissionProps {
  /** Permiso requerido para acceder a la página. */
  permission: string;
  children: React.ReactNode;
}

/**
 * Wrapper de ruta para gateo por permiso.
 *
 * Estrategia (D-F4 del design):
 * - loading → skeleton (evita flash "sin permiso" antes de tener datos)
 * - sin permiso → vista inline con mensaje y CTA (NO redirect; preserva la URL)
 * - con permiso → renderiza children
 *
 * Se coloca envolviendo el `element` de la ruta en router.tsx:
 * @example
 * element: <RequirePermission permission={PERMISSIONS.contabilidad.eeff.read}>
 *   <BalanceGeneralPage />
 * </RequirePermission>
 */
export function RequirePermission({
  permission,
  children,
}: RequirePermissionProps): React.JSX.Element {
  const { has, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!has(permission)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No tenés permiso para ver esta página</h2>
        <p className="text-sm text-muted-foreground">
          Contactá al administrador de tu organización para solicitar acceso.
        </p>
        <Button variant="outline" asChild>
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
