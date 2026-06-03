import { Shield } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { Button } from '@/components/ui/button';

import { useEsSuperAdmin } from '../hooks/use-es-super-admin';

/**
 * Acceso al panel de plataforma desde la app de tenant (DashboardShell).
 *
 * Cierra la asimetría de navegación SA↔tenant: un super-admin que TAMBIÉN es
 * miembro de una org tiene `activeTenantId`, así que IndexRedirect lo manda a
 * la app y NO al panel. Sin este acceso quedaba "atrapado" en la app (solo
 * llegaba al panel tipeando /platform-admin a mano).
 *
 * Gating server-authoritative vía useEsSuperAdmin (fail-closed: sin confirmar
 * → no se muestra). Es navegación, no una acción puntual → se OCULTA cuando no
 * aplica (§14.7 frontend), no se deshabilita.
 */
export function PlatformPanelLink(): React.JSX.Element | null {
  const { esSuperAdmin } = useEsSuperAdmin();

  if (!esSuperAdmin) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      asChild
      aria-label="Ir al panel de plataforma"
      // Icon-only en mobile con tap target 44px (Apple HIG §7); label desde sm+.
      className="h-11 w-11 sm:h-9 sm:w-auto sm:px-3"
    >
      <NavLink to="/platform-admin">
        <Shield className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Plataforma</span>
      </NavLink>
    </Button>
  );
}
