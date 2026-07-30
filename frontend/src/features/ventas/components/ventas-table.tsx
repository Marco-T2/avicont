import { Plus, ShoppingCart } from 'lucide-react';

import { PermissionButton } from '@/components/shared/permission-button';
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
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
// Cross-feature: el estado de la venta ES el de su comprobante (REQ-VTA-01) y
// el flag anulado es ortogonal (§4.7) — mismo badge, misma semántica visual.
import { EstadoComprobanteBadge } from '@/features/comprobantes/components/estado-comprobante-badge';
// Cross-feature: fecha contable YYYY-MM-DD → dd/mm/yyyy sin shift UTC (§4.6).
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
// Cross-feature: celda de monto monoespaciada — el montoTotal del backend se
// muestra tal cual, sin recalcular (§4.5).
import { MontoCell } from '@/features/comprobantes/components/monto-cell';
import type { VentaListItem } from '@/types/api';

import { CondicionPagoBadge } from './condicion-pago-badge';

interface VentasTableProps {
  ventas: VentaListItem[];
  isLoading: boolean;
  // Distingue los dos empty states de §13.4: con filtros activos no hay CTA.
  hayFiltros: boolean;
  /** Resuelve el nombre del cliente — el listado solo trae contactoId. */
  nombreContacto: (contactoId: string) => string;
  onCrear: () => void;
  onAbrir: (id: string) => void;
}

/**
 * Listado de ventas. Una venta anulada se muestra MARCADA (badge + fila
 * atenuada), nunca se esconde (§4.7).
 *
 * Estrategia de tabla (frontend/CLAUDE.md §7): scroll horizontal con
 * `min-w-[880px]` — en mobile el contenedor scrollea; la columna Fecha/Número
 * queda como ancla de lectura.
 */
export function VentasTable({
  ventas,
  isLoading,
  hayFiltros,
  nombreContacto,
  onCrear,
  onAbrir,
}: VentasTableProps): React.JSX.Element {
  if (isLoading && ventas.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!isLoading && ventas.length === 0) {
    if (hayFiltros) {
      return (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            No se encontraron resultados.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
        <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">No hay ventas todavía</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrá tu primera venta: el asiento contable se genera solo.
        </p>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.ventas.create}
          deniedReason="No tenés permiso para registrar ventas"
          onClick={onCrear}
          className="mt-4"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva venta
        </PermissionButton>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[880px]">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Número</TableHead>
            <TableHead className="min-w-[180px]">Cliente</TableHead>
            <TableHead>Condición</TableHead>
            <TableHead className="min-w-[200px]">Glosa</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ventas.map((venta) => (
            <TableRow
              key={venta.id}
              className={cn(venta.anulado && 'opacity-60')}
            >
              <TableCell className="whitespace-nowrap">
                {formatearFechaContable(venta.fechaContable)}
              </TableCell>
              <TableCell>
                {venta.numero !== null ? (
                  <span className="font-mono text-xs">{venta.numero}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-medium">
                <span className="line-clamp-1" title={nombreContacto(venta.contactoId)}>
                  {nombreContacto(venta.contactoId)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <CondicionPagoBadge condicionPago={venta.condicionPago} />
                  {venta.fechaVencimiento !== null && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      Vence {formatearFechaContable(venta.fechaVencimiento)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <span className="line-clamp-1" title={venta.glosa}>
                  {venta.glosa}
                </span>
              </TableCell>
              {/* §4.5: montoTotal es el string del backend, sin recalcular. */}
              <TableCell className="text-right">
                <MontoCell monto={venta.montoTotal} />
              </TableCell>
              <TableCell>
                <EstadoComprobanteBadge
                  estado={venta.estado}
                  anulado={venta.anulado}
                />
              </TableCell>
              <TableCell className="text-right">
                {/* Navegación, no acción: el editor gatea cada acción por
                    botón (§14.7) — acá basta el read que ya te dejó ver la lista. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAbrir(venta.id)}
                >
                  Abrir
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
