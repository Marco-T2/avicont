import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import { cn } from '@/lib/utils';
import type { ArranqueAplicado } from '@/types/api';

import { idArranqueVigente } from '../lib/arranque-vigente';

interface HistorialArranquesProps {
  /** Ya ordenado por el backend (`fecha DESC, createdAt DESC`) — no re-ordenar. */
  historial: ArranqueAplicado[];
  corte: string;
  isLoading: boolean;
}

/**
 * Historial COMPLETO de declaraciones de arranque (REQ-ICB-04, D8): el
 * registro es append-only, una declaración posterior nunca borra ni oculta
 * las anteriores — una corrección retroactiva deja ambas a la vista. La fila
 * vigente al corte se señala; el señalamiento usa el orden del backend, no
 * reimplementa `vigenteA`.
 */
export function HistorialArranques({
  historial,
  corte,
  isLoading,
}: HistorialArranquesProps): React.JSX.Element {
  if (isLoading && historial.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (historial.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          Todavía no hay declaraciones de arranque para esta cuenta.
        </p>
      </div>
    );
  }

  const vigenteId = idArranqueVigente(historial, corte);

  return (
    <div className="space-y-2">
      {vigenteId === null && (
        <p className="text-sm text-muted-foreground">
          Ninguna declaración aplica a este corte: todas son posteriores.
        </p>
      )}
      <ul className="divide-y rounded-md border">
        {historial.map((a) => {
          const aplica = a.id === vigenteId;
          return (
            <li key={a.id} className={cn('space-y-1 px-4 py-3', aplica && 'bg-accent/50')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {formatearFechaContable(a.fecha)}
                </span>
                {aplica && (
                  <Badge
                    variant="outline"
                    className="font-normal text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900"
                  >
                    Aplica a este corte
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Extracto:{' '}
                  <span className="tabular-nums text-foreground">
                    {formatearMontoBob(a.saldoExtracto)}
                  </span>
                </span>
                <span>
                  Libros:{' '}
                  <span className="tabular-nums text-foreground">
                    {formatearMontoBob(a.saldoLibros)}
                  </span>
                </span>
                <span>
                  Residual declarada:{' '}
                  <span className="tabular-nums text-foreground">
                    {formatearMontoBob(a.diferenciaResidual)}
                  </span>
                </span>
              </div>
              {a.nota !== null && (
                <p className="text-xs italic text-muted-foreground">{a.nota}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Declarada el {formatearFechaContable(a.declaradoEl.slice(0, 10))} por{' '}
                {a.declaradoPorUserId}.
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
