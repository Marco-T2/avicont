import type { PlatformActivityItem } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export interface ActivityTimelineProps {
  /** Items ya aplanados de todas las páginas cargadas. */
  items: PlatformActivityItem[];
  /** Si hay más páginas disponibles para cargar. */
  hasNextPage: boolean;
  /** Si se está cargando la siguiente página. */
  isFetchingNextPage: boolean;
  /** Callback para disparar la carga de la siguiente página. */
  onFetchMore: () => void;
}

const FECHA_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return FECHA_FORMATTER.format(fecha);
}

/**
 * Timeline de actividad de plataforma. Presentacional puro.
 * Muestra metadata: acción, org destino, actor, fecha. Sin payload crudo.
 * El botón "Cargar más" dispara fetchNextPage del hook infinito.
 */
export function ActivityTimeline({
  items,
  hasNextPage,
  isFetchingNextPage,
  onFetchMore,
}: ActivityTimelineProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-md border">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.action}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {item.targetOrganization !== null &&
                    item.targetOrganization !== undefined && (
                      <span>
                        Org:{' '}
                        <span className="font-medium text-foreground">
                          {item.targetOrganization.name}
                        </span>
                      </span>
                    )}
                  <span>
                    Por:{' '}
                    <span className="font-medium text-foreground">
                      {item.actor.displayName ?? item.actor.email}
                    </span>
                  </span>
                </div>
              </div>
              <time
                dateTime={item.createdAt}
                className="shrink-0 text-xs text-muted-foreground mt-1 sm:mt-0"
              >
                {formatearFecha(item.createdAt)}
              </time>
            </div>
          </li>
        ))}
      </ul>

      {isFetchingNextPage && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {hasNextPage && !isFetchingNextPage && (
        <div className="flex justify-center pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onFetchMore}
            className="w-full sm:w-auto"
          >
            Cargar más
          </Button>
        </div>
      )}

      {!hasNextPage && items.length > 0 && (
        <p className="text-center text-xs text-muted-foreground py-2">
          No hay más actividad.
        </p>
      )}
    </div>
  );
}
