import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/lib/use-permissions';

// Guard de rutas autenticadas. Mientras el bootstrap está en curso (refresh
// inicial desde cookie), mostramos children — el BootstrapGate superior ya
// retarda el render hasta que termina. Si el usuario no tiene accessToken
// después del bootstrap, redirigimos a /login conservando la ruta original.
export function ProtectedRoute(): React.JSX.Element {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  // Warm-up de permisos (D-F5): llamar usePermissions() acá precalienta el
  // cache de TanStack Query para que <Can> y <RequirePermission> en las páginas
  // hijas tengan la data disponible al primer render. TanStack deduplica la query
  // por queryKey → una sola request HTTP aunque múltiples componentes llamen al hook.
  // El enabled: Boolean(accessToken && activeTenantId) dentro del hook la bloquea
  // durante bootstrap, así que no hay riesgo de 403 prematuro.
  usePermissions();

  if (accessToken === null) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
