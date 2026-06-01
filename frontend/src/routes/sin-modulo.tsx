import { Link } from 'react-router-dom';

import { useHasSystemRole } from '@/lib/use-permissions';

/**
 * Estado liviano para organizaciones sin vertical asignado (vertical === null).
 * Diferenciado por rol:
 * - Admin (OWNER/ADMIN): mensaje + enlace a /settings/features para activar un módulo.
 * - No-admin: mensaje informativo sin acción (el RBAC de /settings/features lo bloquearía).
 *
 * Ver design §5 — no se crea un onboarding paralelo; se reusa la única superficie
 * existente para gestionar módulos.
 */
export function SinModulo(): React.JSX.Element {
  const isAdmin = useHasSystemRole(['OWNER', 'ADMIN']);

  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      {isAdmin ? (
        <>
          <h2 className="text-lg font-semibold text-foreground">No hay un módulo activo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Activá un módulo para empezar a usar la plataforma.
          </p>
          <Link
            to="/settings/features"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Activá un módulo
          </Link>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-foreground">Sin módulo activo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu organización no tiene un módulo activo. Pedile a tu administrador que active uno.
          </p>
        </>
      )}
    </div>
  );
}
