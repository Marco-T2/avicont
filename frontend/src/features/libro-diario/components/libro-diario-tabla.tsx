import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { AsientoLibroDiario } from '@/types/api';

import { formatearFechaLibroDiario } from '../lib/formatear-fecha-libro-diario';
import { formatearMontoBob } from '../lib/formatear-monto-bob';

// ============================================================
// Props
// ============================================================

interface LibroDiarioTablaProps {
  asientos: AsientoLibroDiario[] | undefined;
  totalDebeBob: string;
  totalHaberBob: string;
  isLoading: boolean;
  isError: boolean;
}

// ============================================================
// Sub-componentes
// ============================================================

function TableSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

interface MontoBobProps {
  monto: string;
  className?: string;
}

function MontoBob({ monto, className }: MontoBobProps): React.JSX.Element {
  return (
    <span className={cn('font-mono tabular-nums text-sm', className)}>
      <span className="text-muted-foreground text-xs mr-0.5">Bs</span>
      {formatearMontoBob(monto)}
    </span>
  );
}

interface AsientoCabeceraProps {
  asiento: AsientoLibroDiario;
  colSpan: number;
}

function AsientoCabecera({ asiento, colSpan }: AsientoCabeceraProps): React.JSX.Element {
  const esAnulado = asiento.anulado;

  return (
    <TableRow className={cn('bg-muted/30', esAnulado && 'opacity-60')}>
      <TableCell
        colSpan={colSpan}
        className="py-2"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
            {formatearFechaLibroDiario(asiento.fechaContable)}
          </span>
          <span className="font-mono text-xs font-medium whitespace-nowrap">
            {asiento.numero ?? '—'}
          </span>
          <span className="text-sm font-medium truncate flex-1 min-w-0">
            {asiento.glosa}
          </span>
          {esAnulado && (
            <span className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive font-medium whitespace-nowrap">
              Anulado
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============================================================
// Componente principal
// ============================================================

/**
 * Tabla del Libro Diario agrupada por asiento.
 *
 * Estructura de la tabla:
 * - Fila de cabecera por asiento: fecha + número + glosa (+ badge si anulado)
 * - Sub-filas: una por línea del asiento (código cuenta, nombre, debe, haber)
 * - Fila de totales al pie: suma totalDebeBob / totalHaberBob del período
 *
 * Estados: loading (skeleton), vacío (empty state), error (banner), datos.
 *
 * CLAUDE.md §4.6: fechas formateadas en America/La_Paz (dd/mm/yyyy).
 * CLAUDE.md §4.5: montos llegan como string — no aritmética sobre ellos.
 *
 * Anti-F-10: variables semánticas del tema para dark mode.
 * JSDOM renderiza todo el árbol DOM — tests usan getAllByText para valores repetidos.
 */
export function LibroDiarioTabla({
  asientos,
  totalDebeBob,
  totalHaberBob,
  isLoading,
  isError,
}: LibroDiarioTablaProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudieron cargar los asientos del Libro Diario. Intentá de nuevo.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (asientos !== undefined && asientos.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay asientos para mostrar en el período seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      {/* min-w: piso de ancho para que la tabla no aplaste columnas en tablets.
          CLAUDE.md §7 "tablas con muchas columnas → scroll horizontal". */}
      <Table className="min-w-[700px] table-fixed">
        <colgroup>
          <col className="w-[14%]" /> {/* Código cuenta */}
          <col className="w-[36%]" /> {/* Nombre cuenta */}
          <col className="w-[25%]" /> {/* Glosa línea */}
          <col className="w-[12%]" /> {/* Debe BOB */}
          <col className="w-[13%]" /> {/* Haber BOB */}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Cuenta</TableHead>
            <TableHead>Glosa línea</TableHead>
            <TableHead className="text-right">Debe BOB</TableHead>
            <TableHead className="text-right">Haber BOB</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(asientos ?? []).map((asiento) => (
            // Fragment con key para agrupar cabecera + líneas por asiento
            // sin añadir un nodo DOM extra (no se puede anidar <tr> dentro de <tr>).
            // Anti-F-06: key estable por asiento.id (no índice).
            <React.Fragment key={asiento.id}>
              {/* Fila cabecera del asiento */}
              <AsientoCabecera asiento={asiento} colSpan={5} />

              {/* Sub-filas: una por línea */}
              {asiento.lineas.map((linea, idx) => (
                <TableRow
                  key={`${asiento.id}-linea-${idx}`}
                  className={cn(asiento.anulado && 'opacity-60')}
                >
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {linea.codigoCuenta}
                  </TableCell>
                  <TableCell className="text-sm">{linea.nombreCuenta}</TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate">
                    {linea.glosa ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {linea.debeBob !== '0.00' ? (
                      <MontoBob monto={linea.debeBob} />
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {linea.haberBob !== '0.00' ? (
                      <MontoBob monto={linea.haberBob} />
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </React.Fragment>
          ))}

          {/* Fila de totales del período */}
          <TableRow className="border-t-2 font-semibold bg-muted/20">
            <TableCell colSpan={3} className="text-sm font-semibold">
              Total del período
            </TableCell>
            <TableCell className="text-right">
              <MontoBob monto={totalDebeBob} className="font-semibold" />
            </TableCell>
            <TableCell className="text-right">
              <MontoBob monto={totalHaberBob} className="font-semibold" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
