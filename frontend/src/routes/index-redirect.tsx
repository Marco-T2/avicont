import { Navigate } from 'react-router-dom';

import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { Skeleton } from '@/components/ui/skeleton';
import { useVerticalActivo } from '@/lib/use-vertical';

import { SinModulo } from './sin-modulo';

/**
 * Resuelve el destino de `/` según el vertical activo de la organización.
 *
 * Fail-closed contra el flash: mientras el vertical no resuelve (undefined),
 * muestra skeleton — NO el dashboard contable (REQ-SV-3).
 *
 * Ramas:
 * - undefined (cargando)  → skeleton
 * - 'GRANJA'             → <Navigate replace> a /granja
 * - null (sin módulo)    → <SinModulo> (admin ve botón, no-admin ve mensaje)
 * - 'CONTABILIDAD'       → <DashboardPage> (comportamiento previo al change)
 */
export function IndexRedirect(): React.JSX.Element {
  const { vertical } = useVerticalActivo();

  // undefined = cargando → skeleton, NO flash de la pantalla contable.
  if (vertical === undefined) {
    return (
      <div data-testid="index-redirect-skeleton" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (vertical === 'GRANJA') {
    return <Navigate to="/granja" replace />;
  }

  // null → org sin módulo: componente liviano diferenciado por rol (REQ-SV-4).
  // NO se redirige directamente a /settings/features: el no-admin vería el
  // estado denegado de RequirePermission, que no es la UX correcta.
  if (vertical === null) {
    return <SinModulo />;
  }

  // 'CONTABILIDAD' → dashboard contable (comportamiento previo al change).
  return <DashboardPage />;
}
