import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { VentaEstadoCuenta } from '@/types/api';

// Cross-feature: formateo de fecha contable YYYY-MM-DD → dd/mm/yyyy sin
// desplazar el día por UTC (§4.6). Función pura compartida por convención del
// change (mismo uso que hoja-trabajo / balance-comprobacion).
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
// Cross-feature: celda de monto monoespaciada (misma presentación que el
// detalle de comprobantes; los montos son strings §4.5 y no se recalculan).
import { MontoCell } from '@/features/comprobantes/components/monto-cell';

import type { FilaAplicacion } from '../lib/auto-tilde-fifo';

interface VentasAbiertasFifoProps {
  /**
   * Ventas abiertas EN EL ORDEN QUE PUBLICA EL BACKEND (REQ-CXC-05): esta
   * tabla las renderiza tal cual, sin reordenar.
   */
  ventas: VentaEstadoCuenta[];
  /** Estado del reparto, alineado 1:1 con `ventas` por ventaId. */
  filas: FilaAplicacion[];
  onToggle: (ventaId: string) => void;
  onMontoChange: (ventaId: string, monto: string) => void;
  disabled?: boolean;
}

/**
 * Tabla de ventas abiertas con auto-tilde FIFO overrideable: checkbox SIEMPRE
 * destildable y monto editable por fila (la sugerencia nunca es auto-match).
 *
 * Estrategia responsive (§7): scroll horizontal con min-w — comparar saldos
 * entre filas es el uso principal y un card-stack lo rompe.
 */
export function VentasAbiertasFifo({
  ventas,
  filas,
  onToggle,
  onMontoChange,
  disabled = false,
}: VentasAbiertasFifoProps): React.JSX.Element {
  const filaPorVenta = new Map(filas.map((f) => [f.ventaId, f]));

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" aria-label="Aplicar" />
            <TableHead>Fecha</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Saldo pendiente</TableHead>
            <TableHead className="text-right w-40">Monto a aplicar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ventas.map((venta) => {
            const fila = filaPorVenta.get(venta.ventaId);
            const tildada = fila?.tildada === true;
            return (
              <TableRow key={venta.ventaId} data-testid={`fila-venta-${venta.ventaId}`}>
                <TableCell>
                  <Checkbox
                    checked={tildada}
                    onCheckedChange={() => onToggle(venta.ventaId)}
                    disabled={disabled}
                    aria-label={`Aplicar a la venta del ${formatearFechaContable(venta.fechaContable)}`}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatearFechaContable(venta.fechaContable)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {venta.fechaVencimiento !== null ? (
                    <span className="inline-flex items-center gap-2">
                      {formatearFechaContable(venta.fechaVencimiento)}
                      {venta.vencida && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          Vencida · {venta.diasAtraso} {venta.diasAtraso === 1 ? 'día' : 'días'}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <MontoCell monto={venta.montoTotal} />
                </TableCell>
                <TableCell className="text-right">
                  <MontoCell monto={venta.saldoPendiente} />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    value={fila?.montoAplicado ?? ''}
                    onChange={(e) => onMontoChange(venta.ventaId, e.target.value)}
                    disabled={disabled || !tildada}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="text-base md:text-sm font-mono text-right"
                    aria-label={`Monto a aplicar a la venta del ${formatearFechaContable(venta.fechaContable)}`}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
