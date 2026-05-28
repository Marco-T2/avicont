import { useNavigate } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ComprobanteListItem } from '@/types/api';

import { formatearFechaContable } from '../lib/formatear-fecha-contable';
import {
  formatearNumeroCorrelativo,
  prefijoDe,
  secuenciaDe,
} from '../lib/formatear-numero-correlativo';
import { EstadoComprobanteBadge } from './estado-comprobante-badge';
import { MontoCell } from './monto-cell';

interface ComprobantesTableProps {
  comprobantes: ComprobanteListItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

function TableSkeleton(): React.JSX.Element {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableRow key={i}>
          <TableCell colSpan={7}>
            <Skeleton className="h-8 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function CorrelativoCell({ numero }: { numero: string | null }): React.JSX.Element {
  const prefijo = prefijoDe(numero);
  const secuencia = secuenciaDe(numero);

  if (prefijo === null) {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {formatearNumeroCorrelativo(numero)}
      </span>
    );
  }

  return (
    <span className="font-mono text-xs">
      {prefijo}
      {secuencia !== null && (
        <span className="text-muted-foreground">-{secuencia}</span>
      )}
    </span>
  );
}

const TIPO_LABELS: Record<string, string> = {
  DIARIO: 'Diario',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
  TRASPASO: 'Traspaso',
  AJUSTE: 'Ajuste',
  APERTURA: 'Apertura',
  CIERRE: 'Cierre',
};

/**
 * Tabla de comprobantes con estrategia responsive:
 * - Desktop (md+): tabla con columnas (tipo, correlativo, estado, fecha, glosa, monto, acción).
 * - Mobile: card-stack por comprobante.
 *
 * JSDOM renderiza ambos simultáneamente — los tests deben usar `getAllByText()`
 * para valores que aparecen dos veces (desktop + mobile).
 */
export function ComprobantesTable({
  comprobantes,
  isLoading,
  isError,
}: ComprobantesTableProps): React.JSX.Element {
  const navigate = useNavigate();

  const handleRowClick = (id: string): void => {
    void navigate(`/comprobantes/${id}`);
  };

  // Estado de error
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudieron cargar los comprobantes. Intentá de nuevo.
        </p>
      </div>
    );
  }

  // Empty state (después de loading)
  if (!isLoading && comprobantes !== undefined && comprobantes.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No hay comprobantes para mostrar con los filtros actuales.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: tabla con scroll horizontal */}
      <div className="hidden md:block relative overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead className="min-w-[8rem]">Número</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Glosa</TableHead>
              <TableHead className="text-right">Total BOB</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : (
              comprobantes?.map((c) => (
                <TableRow
                  key={c.id}
                  onClick={() => handleRowClick(c.id)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="text-sm">
                    {TIPO_LABELS[c.tipo] ?? c.tipo}
                  </TableCell>
                  <TableCell>
                    <CorrelativoCell numero={c.numero} />
                  </TableCell>
                  <TableCell>
                    <EstadoComprobanteBadge estado={c.estado} anulado={c.anulado} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatearFechaContable(c.fechaContable)}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">
                    {c.glosa}
                  </TableCell>
                  <TableCell className="text-right">
                    <MontoCell monto={c.totalDebitoBob} moneda={c.monedaPrincipal} />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(c.id);
                      }}
                    >
                      Ver
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: card stack */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))
        ) : (
          comprobantes?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleRowClick(c.id)}
              className="w-full text-left rounded-md border bg-card p-4 hover:bg-muted/50 min-h-[44px] flex items-start justify-between gap-2"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <EstadoComprobanteBadge estado={c.estado} anulado={c.anulado} />
                  <span className="text-xs text-muted-foreground">
                    {TIPO_LABELS[c.tipo] ?? c.tipo}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">{c.glosa}</p>
                <p className="text-xs text-muted-foreground">
                  {formatearFechaContable(c.fechaContable)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <MontoCell monto={c.totalDebitoBob} moneda={c.monedaPrincipal} />
                <CorrelativoCell numero={c.numero} />
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}
