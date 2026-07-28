import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { MovimientoConciliacion } from '@/types/api';

import { etiquetaLadoBancario } from '../lib/etiquetas-conciliacion';

import { EstadoMovimientoBadge } from './estado-movimiento-badge';

interface MovimientosPanelProps {
  movimientos: MovimientoConciliacion[];
  isLoading: boolean;
  /**
   * Sin `contabilidad.conciliacion.conciliar` la pantalla entra en modo
   * consulta: las acciones por fila NO se renderizan (el banner de la página
   * explica el porqué una sola vez). Excepción documentada a §14.7 para
   * pantallas densas en acciones repetidas por fila.
   */
  modoConsulta: boolean;
  seleccionadoId: string | null;
  onSeleccionar: (id: string) => void;
  onDeshacer: (matchId: string) => void;
  onCambiarEstado: (id: string, estado: 'IGNORADO' | 'PENDIENTE') => void;
  /** Anti-F-07: alguna mutación en vuelo → nada de doble click. */
  accionEnCurso: boolean;
}

/**
 * Panel A del workspace: los movimientos del EXTRACTO bancario.
 *
 * El estado que se pinta es `estadoEfectivo` (derivado), nunca la columna
 * persistida — ver `EstadoMovimientoBadge`.
 *
 * **Layout: filas compactas de 2 renglones, no tabla.** Los dos paneles del
 * workspace van lado a lado (`xl:grid-cols-2`), o sea media pantalla cada uno:
 * una tabla de 7 columnas no entra y termina escondiendo el MONTO detrás de un
 * scroll horizontal, justo el dato que el usuario está comparando. Acá el
 * renglón de arriba lleva fecha + monto + estado + acción (siempre visibles, sin
 * scroll horizontal en ningún viewport) y la descripción del banco —texto libre
 * de un tercero, sin techo de largo— baja al segundo renglón recortada a 2
 * líneas, con el texto completo accesible vía `title`.
 */
export function MovimientosPanel({
  movimientos,
  isLoading,
  modoConsulta,
  seleccionadoId,
  onSeleccionar,
  onDeshacer,
  onCambiarEstado,
  accionEnCurso,
}: MovimientosPanelProps): React.JSX.Element {
  if (isLoading && movimientos.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (movimientos.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay movimientos bancarios en el rango seleccionado.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {movimientos.map((mov) => {
        // Un movimiento solo entra al pool de match manual si su estado
        // EFECTIVO es PENDIENTE — incluye los de vínculo roto (REQ-CB-11).
        const seleccionable = mov.estadoEfectivo === 'PENDIENTE';
        // Solo un vínculo SANO se puede deshacer: uno roto ya devolvió el
        // movimiento al pool (REQ-CB-11) y la salida es ignorarlo o
        // re-confirmarlo contra otra línea.
        const matchDeshacible =
          mov.vinculo !== null && mov.vinculo.roto === null ? mov.vinculo.matchId : null;

        return (
          // Anti-F-06: key = id real del movimiento; las filas se reordenan
          // al confirmar o deshacer un match.
          <li key={mov.id} className="flex gap-2 px-3 py-3">
            {!modoConsulta && (
              // Placeholder de ancho fijo también cuando la fila no es
              // seleccionable: mantiene alineadas todas las filas.
              <span className="flex w-8 shrink-0 justify-center pt-1 sm:w-6">
                {seleccionable && (
                  <input
                    type="radio"
                    name="movimiento-conciliacion"
                    // Más grande en mobile: es el tap target de la selección (§7).
                    className="h-5 w-5 accent-primary sm:h-4 sm:w-4"
                    aria-label={`Seleccionar movimiento ${mov.descripcion}`}
                    checked={seleccionadoId === mov.id}
                    onChange={() => onSeleccionar(mov.id)}
                  />
                )}
              </span>
            )}

            {/* min-w-0: sin esto el texto largo del hijo estira el flex item
                y el recorte de 2 líneas nunca se aplica. */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                  {formatearFechaContable(mov.fecha)}
                </span>
                {/* El monto es el dato que se compara: nunca sale del viewport. */}
                <span className="whitespace-nowrap text-base font-semibold tabular-nums">
                  {formatearMontoBob(mov.monto)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {mov.moneda}
                  </span>
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {etiquetaLadoBancario(mov.tipo)}
                </span>
                <EstadoMovimientoBadge
                  movimiento={mov}
                  className="flex-row flex-wrap items-center gap-x-2"
                />

                {!modoConsulta && (
                  <span className="ml-auto">
                    {matchDeshacible !== null && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={accionEnCurso}
                        onClick={() => onDeshacer(matchDeshacible)}
                      >
                        Deshacer
                      </Button>
                    )}
                    {mov.estadoEfectivo === 'PENDIENTE' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={accionEnCurso}
                        onClick={() => onCambiarEstado(mov.id, 'IGNORADO')}
                      >
                        Ignorar
                      </Button>
                    )}
                    {mov.estadoEfectivo === 'IGNORADO' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={accionEnCurso}
                        onClick={() => onCambiarEstado(mov.id, 'PENDIENTE')}
                      >
                        No ignorar
                      </Button>
                    )}
                  </span>
                )}
              </div>

              {/* Descripción del banco: texto de un tercero, sin techo de largo.
                  `line-clamp-2` la recorta; `title` conserva el texto completo. */}
              <p className="line-clamp-2 break-words text-sm" title={mov.descripcion}>
                {mov.descripcion}
              </p>
              {mov.referencia !== null && (
                <p
                  className="line-clamp-1 break-all text-xs text-muted-foreground"
                  title={mov.referencia}
                >
                  Ref. {mov.referencia}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
