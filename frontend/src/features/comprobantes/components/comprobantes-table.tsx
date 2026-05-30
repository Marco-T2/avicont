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

import { etiquetaContacto } from '../lib/etiquetas-resumen';
import {
  etiquetaDocumentoNumero,
  etiquetaDocumentoTipo,
} from '../lib/etiquetas-resumen';
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
          <TableCell colSpan={9}>
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

/**
 * Tabla de comprobantes con estrategia responsive:
 * - Desktop (md+): tabla con columnas (fecha, número, doc. respaldo + nº ref,
 *   contacto, glosa, estado, total, acción). Scroll horizontal por el ancho.
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
        {/* table-fixed + colgroup: anchos en % predecibles e independientes del
            contenido (una glosa o razón social larga se trunca, no desbalancea
            la fila). Mismo criterio que el editor y el detalle. min-w-[1000px]
            = piso: por debajo scrollea en vez de aplastar (CLAUDE.md §7). */}
        <Table className="min-w-[1000px] table-fixed">
          <colgroup>
            <col className="w-[9%]" /> {/* Fecha */}
            <col className="w-[12%]" /> {/* Número */}
            <col className="w-[13%]" /> {/* Documento */}
            <col className="w-[10%]" /> {/* Nro. Ref. */}
            <col className="w-[15%]" /> {/* Contacto */}
            <col className="w-[21%]" /> {/* Glosa — la más ancha */}
            <col className="w-[10%]" /> {/* Estado */}
            <col className="w-[10%]" /> {/* Total BOB */}
            <col className="w-[56px]" /> {/* Ver — fijo */}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Nro. Ref.</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Glosa</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total BOB</TableHead>
              <TableHead />
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
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatearFechaContable(c.fechaContable)}
                  </TableCell>
                  <TableCell>
                    <CorrelativoCell numero={c.numero} />
                  </TableCell>
                  <TableCell
                    className="text-sm truncate"
                    title={etiquetaDocumentoTipo(c.documentosRespaldo)}
                  >
                    {etiquetaDocumentoTipo(c.documentosRespaldo)}
                  </TableCell>
                  <TableCell
                    className="text-sm font-mono truncate"
                    title={etiquetaDocumentoNumero(c.documentosRespaldo)}
                  >
                    {etiquetaDocumentoNumero(c.documentosRespaldo)}
                  </TableCell>
                  <TableCell className="text-sm truncate" title={etiquetaContacto(c.contactos)}>
                    {etiquetaContacto(c.contactos)}
                  </TableCell>
                  <TableCell className="text-sm truncate" title={c.glosa}>
                    {c.glosa}
                  </TableCell>
                  <TableCell>
                    <EstadoComprobanteBadge estado={c.estado} anulado={c.anulado} />
                  </TableCell>
                  <TableCell className="text-right">
                    {/* totalDebitoBob SIEMPRE es BOB — hardcodeado para evitar bug de display. */}
                    <MontoCell monto={c.totalDebitoBob} moneda="BOB" />
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
                  <span className="text-xs text-muted-foreground truncate">
                    {etiquetaContacto(c.contactos)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">{c.glosa}</p>
                <p className="text-xs text-muted-foreground">
                  {formatearFechaContable(c.fechaContable)} ·{' '}
                  {etiquetaDocumentoTipo(c.documentosRespaldo)}
                  {c.documentosRespaldo.length === 1
                    ? ` ${etiquetaDocumentoNumero(c.documentosRespaldo)}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {/* totalDebitoBob SIEMPRE es BOB — hardcodeado para evitar bug de display. */}
                <MontoCell monto={c.totalDebitoBob} moneda="BOB" />
                <CorrelativoCell numero={c.numero} />
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}
