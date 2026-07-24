import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import { cn } from '@/lib/utils';
import type { LineaConciliacion } from '@/types/api';

import { etiquetaEstadoEfectivoLinea, etiquetaLadoContable } from '../lib/etiquetas-conciliacion';
import { claveLinea } from '../lib/sugerencias';

interface LineasPanelProps {
  lineas: LineaConciliacion[];
  isLoading: boolean;
  modoConsulta: boolean;
  /** Clave de ancla (`comprobanteId#orden`) de la línea seleccionada. */
  seleccionadaClave: string | null;
  onSeleccionar: (comprobanteId: string, orden: number) => void;
}

/**
 * Panel B del workspace: las líneas contables de la cuenta banco en el rango.
 *
 * `EN_TRANSITO` es DERIVADO (REQ-CB-11): no existe ninguna fila persistida con
 * ese estado — es "línea de la cuenta banco sin un match de vínculo válido".
 *
 * **Layout: filas compactas de 2 renglones, no tabla** — mismo criterio que
 * `MovimientosPanel`: el panel ocupa media pantalla y el MONTO (el dato que se
 * compara contra el extracto) nunca puede quedar detrás de un scroll
 * horizontal. La glosa baja al segundo renglón recortada a 2 líneas, con el
 * texto completo accesible vía `title`.
 */
export function LineasPanel({
  lineas,
  isLoading,
  modoConsulta,
  seleccionadaClave,
  onSeleccionar,
}: LineasPanelProps): React.JSX.Element {
  if (isLoading && lineas.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (lineas.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay líneas contables de esta cuenta en el rango seleccionado.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {lineas.map((l) => {
        // Anti-F-06: la línea no tiene id propio; su identidad es el ancla.
        const clave = claveLinea(l.comprobanteId, l.orden);
        const seleccionable = l.estadoEfectivo === 'EN_TRANSITO';

        return (
          <li key={clave} className="flex gap-2 px-3 py-3">
            {!modoConsulta && (
              <span className="flex w-8 shrink-0 justify-center pt-1 sm:w-6">
                {seleccionable && (
                  <input
                    type="radio"
                    name="linea-conciliacion"
                    // Más grande en mobile: es el tap target de la selección (§7).
                    className="h-5 w-5 accent-primary sm:h-4 sm:w-4"
                    aria-label={`Seleccionar línea ${l.numeroComprobante ?? l.comprobanteId} #${l.orden}`}
                    checked={seleccionadaClave === clave}
                    onChange={() => onSeleccionar(l.comprobanteId, l.orden)}
                  />
                )}
              </span>
            )}

            {/* min-w-0: sin esto la glosa larga estira el flex item y el
                recorte de 2 líneas nunca se aplica. */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                  {formatearFechaContable(l.fecha)}
                </span>
                {/* El monto es el dato que se compara: nunca sale del viewport. */}
                <span className="whitespace-nowrap text-base font-semibold tabular-nums">
                  {formatearMontoBob(l.monto)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{l.moneda}</span>
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {l.numeroComprobante ?? '—'}
                  <span className="ml-1">#{l.orden}</span>
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {etiquetaLadoContable(l.tipo)}
                </span>
                <Badge
                  role="status"
                  variant="outline"
                  className={cn(
                    'font-normal',
                    l.estadoEfectivo === 'EN_TRANSITO'
                      ? 'text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900'
                      : 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900',
                  )}
                >
                  {etiquetaEstadoEfectivoLinea(l.estadoEfectivo)}
                </Badge>
              </div>

              {/* Glosa: texto libre del asiento, sin techo de largo. */}
              <p className="line-clamp-2 break-words text-sm" title={l.glosa}>
                {l.glosa}
              </p>
              {l.glosaLinea !== null && (
                <p
                  className="line-clamp-1 break-words text-xs text-muted-foreground"
                  title={l.glosaLinea}
                >
                  {l.glosaLinea}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
