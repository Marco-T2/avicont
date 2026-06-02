import { Navigate } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { useEsSuperAdmin } from '@/features/platform-admin/hooks/use-es-super-admin';

interface RequireSuperAdminProps {
  children: React.ReactNode;
}

/**
 * Guard de ruta para el panel de plataforma. Análogo a RequirePermission pero
 * gateando por `esSuperAdmin` (server-authoritative, ver useEsSuperAdmin).
 *
 * - isLoading → skeleton (evita flash/redirect prematuro)
 * - esSuperAdmin false (resuelto) → <Navigate to="/" replace> (lo saca del panel;
 *   el IndexRedirect lo manda a su destino normal de tenant)
 * - esSuperAdmin true → renderiza children
 */
export function RequireSuperAdmin({
  children,
}: RequireSuperAdminProps): React.JSX.Element {
  const { esSuperAdmin, isLoading } = useEsSuperAdmin();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!esSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
