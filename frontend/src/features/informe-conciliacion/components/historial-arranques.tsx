import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { nombreDelDeclarante } from '../lib/declarante';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import { cn } from '@/lib/utils';
import type { ArranqueAplicado } from '@/types/api';

import { idArranqueVigente } from '../lib/arranque-vigente';
import { AnularArranqueDialog } from './anular-arranque-dialog';

interface HistorialArranquesProps {
  /** Ya ordenado por el backend (`fecha DESC, createdAt DESC`) — no re-ordenar. */
  historial: ArranqueAplicado[];
  corte: string;
  isLoading: boolean;
  cuentaBancariaId: string;
  /** Sin `conciliar` se ve el historial completo pero no se anula nada (D7). */
  puedeConciliar: boolean;
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
  cuentaBancariaId,
  puedeConciliar,
}: HistorialArranquesProps): React.JSX.Element {
  const [aAnular, setAAnular] = useState<ArranqueAplicado | null>(null);
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
            <li
              key={a.id}
              className={cn(
                'space-y-1 px-4 py-3',
                aplica && 'bg-accent/50',
                // Anulada: se atenúa pero NO se esconde (§4.7) — que alguien
                // haya fijado mal el punto de partida es parte del rastro.
                a.anulado && 'opacity-60',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    a.anulado && 'line-through',
                  )}
                >
                  {formatearFechaContable(a.fecha)}
                </span>
                {a.anulado && (
                  <Badge variant="outline" className="font-normal text-destructive">
                    Anulada
                  </Badge>
                )}
                {puedeConciliar && !a.anulado && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={() => setAAnular(a)}
                  >
                    Anular
                  </Button>
                )}
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
                {nombreDelDeclarante(a.declaradoPorNombre)}.
              </p>
              {a.anulado && (
                <p className="text-xs text-destructive">
                  Anulada
                  {a.anuladoEl !== null
                    ? ` el ${formatearFechaContable(a.anuladoEl.slice(0, 10))}`
                    : ''}{' '}
                  por {nombreDelDeclarante(a.anuladoPorNombre)}
                  {a.motivoAnulacion !== null ? `: ${a.motivoAnulacion}` : ''}.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* `key` por declaración: remonta el diálogo, así el motivo arranca en
          blanco sin sincronizar estado en un efecto. */}
      <AnularArranqueDialog
        key={aAnular?.id ?? 'ninguna'}
        arranque={aAnular}
        cuentaBancariaId={cuentaBancariaId}
        onClose={() => setAAnular(null)}
      />
    </div>
  );
}
