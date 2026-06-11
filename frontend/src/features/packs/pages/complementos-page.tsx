import { Skeleton } from '@/components/ui/skeleton';

import { ComplementoRow } from '../components/complemento-row';
import { useMisPacksGestion } from '../hooks/use-mis-packs-gestion';

/**
 * Pantalla del Owner para activar/desactivar packs habilitados por la plataforma.
 * Label user-facing "Complementos" (D-01 del design packs-gestion-ui).
 */
export function ComplementosPage(): React.JSX.Element {
  const query = useMisPacksGestion();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Complementos</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Activá o desactivá los complementos que la plataforma habilitó para tu organización.
        </p>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : null}

      {query.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudieron cargar los complementos. Intentá de nuevo.
          </p>
        </div>
      ) : null}

      {query.data !== undefined && query.data.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Tu organización no tiene complementos habilitados. Contactá al administrador de la
            plataforma.
          </p>
        </div>
      ) : null}

      {query.data !== undefined && query.data.length > 0 ? (
        <div className="space-y-2">
          {query.data.map((entitlement) => (
            <ComplementoRow key={entitlement.id} entitlement={entitlement} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
