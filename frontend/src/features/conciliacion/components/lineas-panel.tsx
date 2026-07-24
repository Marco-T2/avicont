import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
          <Skeleton key={i} className="h-10 w-full" />
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
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            {!modoConsulta && <TableHead className="w-10" />}
            <TableHead className="w-28">Fecha</TableHead>
            <TableHead className="w-36">Comprobante</TableHead>
            <TableHead className="min-w-[200px]">Glosa</TableHead>
            <TableHead>Lado</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineas.map((l) => {
            // Anti-F-06: la línea no tiene id propio; su identidad es el ancla.
            const clave = claveLinea(l.comprobanteId, l.orden);
            const seleccionable = l.estadoEfectivo === 'EN_TRANSITO';

            return (
              <TableRow key={clave}>
                {!modoConsulta && (
                  <TableCell>
                    {seleccionable && (
                      <input
                        type="radio"
                        name="linea-conciliacion"
                        className="h-4 w-4 accent-primary"
                        aria-label={`Seleccionar línea ${l.numeroComprobante ?? l.comprobanteId} #${l.orden}`}
                        checked={seleccionadaClave === clave}
                        onChange={() => onSeleccionar(l.comprobanteId, l.orden)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatearFechaContable(l.fecha)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {l.numeroComprobante ?? '—'}
                  <span className="ml-1 text-xs text-muted-foreground">#{l.orden}</span>
                </TableCell>
                <TableCell>
                  <span className="block">{l.glosa}</span>
                  {l.glosaLinea !== null && (
                    <span className="block text-xs text-muted-foreground">{l.glosaLinea}</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {etiquetaLadoContable(l.tipo)}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {formatearMontoBob(l.monto)}
                  <span className="ml-1 text-xs text-muted-foreground">{l.moneda}</span>
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
