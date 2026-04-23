import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/stores/auth-store';

// Guard de rutas autenticadas. Mientras el bootstrap está en curso (refresh
// inicial desde cookie), mostramos children — el BootstrapGate superior ya
// retarda el render hasta que termina. Si el usuario no tiene accessToken
// después del bootstrap, redirigimos a /login conservando la ruta original.
export function ProtectedRoute(): React.JSX.Element {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();
  if (accessToken === null) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
