import { Navigate } from 'react-router-dom';

import { useHasSystemRole } from '@/lib/use-permissions';
import type { SystemRole } from '@/types/api';

interface RequireSystemRoleProps {
  /** SystemRoles que el usuario debe tener (al menos uno). */
  roles: SystemRole[];
  children: React.ReactNode;
}

/**
 * Wrapper de ruta para gateo por SystemRole (OWNER/ADMIN).
 *
 * Estrategia (D-F4 del design, variante synchronous):
 * - NO hay loading state — `user.roles` viene del JWT decodificado en Zustand
 *   (sincrónico, sin query). No hay riesgo de flash "sin permiso".
 * - sin rol → redirige a "/" (fail-closed, NO muestra mensaje inline)
 * - con rol → renderiza children
 *
 * Diferencia con `RequirePermission`: no tiene loading state porque los
 * SystemRoles no dependen de un fetch (están en el JWT en memoria).
 *
 * @example
 * element: <RequireSystemRole roles={['OWNER', 'ADMIN']}>
 *   <ComplementosPage />
 * </RequireSystemRole>
 */
export function RequireSystemRole({
  roles,
  children,
}: RequireSystemRoleProps): React.JSX.Element {
  const allowed = useHasSystemRole(roles);

  if (!allowed) return <Navigate to="/" replace />;

  return <>{children}</>;
}
