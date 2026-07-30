import { HandCoins, Plus } from 'lucide-react';

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
import type { CobroListItem } from '@/types/api';

// Cross-feature: badge de estado + formateo de fecha del núcleo de
// comprobantes (el cobro hereda el estado de su comprobante INGRESO, D-11).
import { EstadoComprobanteBadge } from '@/features/comprobantes/components/estado-comprobante-badge';
import { MontoCell } from '@/features/comprobantes/components/monto-cell';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';

interface CobrosTableProps {
  cobros: CobroListItem[];
  isLoading: boolean;
  hayFiltros: boolean;
  /** Razón social por contactoId — el listado solo trae el id. */
  contactoPorId: Map<string, string>;
  /** "nombre · código" por cuentaId — ídem. */
  cuentaPorId: Map<string, string>;
  onCrear: () => void;
  onAbrir: (id: string) => void;
}

// Estrategia responsive (§7): scroll horizontal con min-w — tabla de montos y
// estados que se compara fila a fila; card-stack le quita la lectura tabular.
export function CobrosTable({
  cobros,
  isLoading,
  hayFiltros,
  contactoPorId,
  cuentaPorId,
  onCrear,
  onAbrir,
}: CobrosTableProps): React.JSX.Element {
  if (isLoading && cobros.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!isLoading && cobros.length === 0) {
    if (hayFiltros) {
      return (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">No se encontraron resultados.</p>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
        <HandCoins className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">No hay cobros todavía</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrá los pagos de tus clientes y aplicalos a sus ventas pendientes.
        </p>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.cobros.create}
          deniedReason="No tenés permiso para registrar cobros"
          onClick={onCrear}
          className="mt-4"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo cobro
        </PermissionButton>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Número</TableHead>
            <TableHead className="min-w-[180px]">Cliente</TableHead>
            <TableHead className="min-w-[200px]">Glosa</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Cuenta destino</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cobros.map((cobro) => (
            <TableRow key={cobro.id}>
              <TableCell className="whitespace-nowrap">
                {formatearFechaContable(cobro.fechaContable)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {cobro.numero ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="font-medium">
                {contactoPorId.get(cobro.contactoId) ?? (
                  // Fallback UUID: mismo riesgo conocido y aceptado que en el
                  // detalle de comprobantes (cap de pageSize del lookup).
                  <span className="font-mono text-xs text-muted-foreground">
                    {cobro.contactoId}
                  </span>
                )}
              </TableCell>
              <TableCell className="max-w-[280px] truncate text-muted-foreground">
                {cobro.glosa}
              </TableCell>
              <TableCell className="text-right">
                <MontoCell monto={cobro.monto} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {cuentaPorId.get(cobro.cuentaDestinoId) ?? (
                  <span className="font-mono text-xs">{cobro.cuentaDestinoId}</span>
                )}
              </TableCell>
              <TableCell>
                <EstadoComprobanteBadge estado={cobro.estado} anulado={cobro.anulado} />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => onAbrir(cobro.id)}>
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
