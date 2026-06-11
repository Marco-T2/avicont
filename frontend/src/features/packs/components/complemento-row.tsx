import { Switch } from '@/components/ui/switch';
import type { OrgPackEntitlement } from '@/types/api';

import { useActivarPack } from '../hooks/use-activar-pack';

interface ComplementoRowProps {
  entitlement: OrgPackEntitlement;
}

/**
 * Fila de un complemento habilitado en la pantalla del Owner.
 * Muestra nombre, descripción y clave del pack con un switch de activación.
 *
 * Toast: vive en el hook `useActivarPack` (Anti-F-13), no en el componente.
 */
export function ComplementoRow({ entitlement }: ComplementoRowProps): React.JSX.Element {
  const mutation = useActivarPack();
  const switchId = `complemento-${entitlement.pack.clave}`;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={switchId} className="cursor-pointer font-medium">
          {entitlement.pack.nombre}
        </label>
        {entitlement.pack.descripcion !== null ? (
          <p className="text-sm text-muted-foreground">{entitlement.pack.descripcion}</p>
        ) : null}
        <code className="text-xs text-muted-foreground/80">{entitlement.pack.clave}</code>
      </div>
      <Switch
        id={switchId}
        checked={entitlement.activo}
        disabled={mutation.isPending}
        onCheckedChange={(next) =>
          mutation.mutate({ clave: entitlement.pack.clave, activo: next })
        }
        aria-label={`${entitlement.activo ? 'Desactivar' : 'Activar'} ${entitlement.pack.nombre}`}
      />
    </div>
  );
}
