import { Plus } from 'lucide-react';

import { PermissionButton } from '@/components/shared/permission-button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { CustomRole } from '@/types/api';

interface RolesMasterProps {
  roles: CustomRole[];
  loading?: boolean;
  /** Id del rol abierto en el detalle, o 'nuevo' mientras se crea uno. */
  seleccionado: string | undefined;
  onSeleccionar: (role: CustomRole) => void;
  onCrear: () => void;
}

// Panel maestro del editor de roles: lista corta, selección única.
// Presentacional puro — no consulta hooks ni conoce la ruta.
export function RolesMaster({
  roles,
  loading = false,
  seleccionado,
  onSeleccionar,
  onCrear,
}: RolesMasterProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Roles
      </h2>

      {loading && roles.length === 0 ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : null}

      {!loading && roles.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground">
          Todavía no hay roles personalizados.
        </p>
      ) : null}

      <ul className="space-y-1">
        {roles.map((role) => {
          const activo = seleccionado === role.id;
          return (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => onSeleccionar(role)}
                aria-current={activo ? 'true' : undefined}
                className={cn(
                  'flex w-full min-h-11 flex-col items-start gap-0.5 rounded-md border border-transparent px-3 py-2 text-left hover:bg-accent',
                  activo && 'border-primary/40 bg-accent',
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {role.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {role.permissions.length}
                  </span>
                </span>
                {role.isSystemDefault ? (
                  <Badge variant="outline" className="text-[10px]">
                    Plantilla
                  </Badge>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <PermissionButton
        permission={PERMISSIONS.organizacion.roles.create}
        deniedReason="No tenés permiso para crear roles"
        variant="outline"
        onClick={onCrear}
        className="mt-1 w-full justify-start"
      >
        <Plus className="h-4 w-4 mr-2" />
        Nuevo rol
      </PermissionButton>
    </div>
  );
}
