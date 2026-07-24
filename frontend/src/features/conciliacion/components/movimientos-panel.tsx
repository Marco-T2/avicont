import { Button } from '@/components/ui/button';
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
          <Skeleton key={i} className="h-10 w-full" />
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
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            {!modoConsulta && <TableHead className="w-10" />}
            <TableHead className="w-28">Fecha</TableHead>
            <TableHead className="min-w-[200px]">Descripción</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Estado</TableHead>
            {!modoConsulta && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
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
              <TableRow key={mov.id}>
                {!modoConsulta && (
                  <TableCell>
                    {seleccionable && (
                      <input
                        type="radio"
                        name="movimiento-conciliacion"
                        className="h-4 w-4 accent-primary"
                        aria-label={`Seleccionar movimiento ${mov.descripcion}`}
                        checked={seleccionadoId === mov.id}
                        onChange={() => onSeleccionar(mov.id)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatearFechaContable(mov.fecha)}
                </TableCell>
                <TableCell>
                  <span className="block">{mov.descripcion}</span>
                  {mov.referencia !== null && (
                    <span className="block text-xs text-muted-foreground">
                      Ref. {mov.referencia}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {etiquetaLadoBancario(mov.tipo)}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {formatearMontoBob(mov.monto)}
                  <span className="ml-1 text-xs text-muted-foreground">{mov.moneda}</span>
                </TableCell>
                <TableCell>
                  <EstadoMovimientoBadge movimiento={mov} />
                </TableCell>
                {!modoConsulta && (
                  <TableCell className="text-right whitespace-nowrap">
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
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
