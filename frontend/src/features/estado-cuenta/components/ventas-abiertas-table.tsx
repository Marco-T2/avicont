import { Badge } from '@/components/ui/badge';
// Cross-feature: formateadores transversales de presentación (§4.5 / §4.6).
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import { cn } from '@/lib/utils';
import type { EstadoComercialVenta, VentaEstadoCuenta } from '@/types/api';

// ============================================================
// Props
// ============================================================

interface VentasAbiertasTableProps {
  /**
   * Ventas de la cartera EN ORDEN CANÓNICO FIFO tal como las publica el
   * backend (REQ-CXC-05). Este componente las renderiza en el orden del
   * array — NO ordena por fecha ni ofrece sort de columnas: el orden es
   * contrato del backend, no una preferencia de UI.
   */
  ventas: VentaEstadoCuenta[];
  /** Total que publica el backend — se renderiza sin recalcular (§4.5). */
  totalSaldoPendiente: string;
  /** Para el matiz del empty state: sin ventas abiertas ≠ en cero si hay anticipos. */
  saldoAFavor: string;
}

// ============================================================
// Helpers de presentación
// ============================================================

const ESTADO_COMERCIAL_LABEL: Record<EstadoComercialVenta, string> = {
  ABIERTA: 'Abierta',
  PARCIAL: 'Parcial',
  SALDADA: 'Saldada',
};

/** Monto BOB alineado a la derecha. El string del backend se formatea SOLO
 *  para display (es-BO) — nunca se opera aritméticamente (§4.5). */
function Monto({ value }: { value: string }): React.JSX.Element {
  return <span className="font-mono tabular-nums text-sm">{formatearMontoBob(value)}</span>;
}

/**
 * Señal de atraso: `vencida` y `diasAtraso` vienen DERIVADOS del backend
 * (ClockPort) — acá solo se muestran, jamás se recalculan contra un "hoy"
 * del cliente (§4.6). La señal es color + texto (badge), nunca solo color (§10).
 */
function AtrasoCell({ venta }: { venta: VentaEstadoCuenta }): React.JSX.Element {
  if (!venta.vencida) {
    return <span className="text-xs text-muted-foreground">Al día</span>;
  }
  return (
    <Badge variant="destructive">
      Vencida · {venta.diasAtraso} {venta.diasAtraso === 1 ? 'día' : 'días'}
    </Badge>
  );
}

// ============================================================
// Componente principal
// ============================================================

/**
 * Tabla de ventas abiertas del estado de cuenta (REQ-CXC-07).
 *
 * Estrategia responsive (frontend CLAUDE.md §7, decisión por tabla): scroll
 * horizontal con `overflow-x-auto` + `min-w` — 7 columnas mayormente numéricas
 * donde comparar filas importa más que la lectura vertical; card-stack rompería
 * la comparación de saldos.
 */
export function VentasAbiertasTable({
  ventas,
  totalSaldoPendiente,
  saldoAFavor,
}: VentasAbiertasTableProps): React.JSX.Element {
  if (ventas.length === 0) {
    const tieneAnticipos = Number(saldoAFavor) !== 0;
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 text-center">
        <p className="text-sm text-muted-foreground">
          El cliente no tiene ventas abiertas: no registra deuda pendiente a la fecha
          de corte.
        </p>
        {tieneAnticipos && (
          <p className="text-sm">
            Pero NO está en cero: mantiene{' '}
            <span className="font-mono tabular-nums font-medium">
              Bs {formatearMontoBob(saldoAFavor)}
            </span>{' '}
            a favor en anticipos sin aplicar.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Fecha</th>
            <th className="px-3 py-2 text-left font-semibold">Vencimiento</th>
            <th className="px-3 py-2 text-left font-semibold">Estado</th>
            <th className="px-3 py-2 text-left font-semibold">Atraso</th>
            <th className="px-3 py-2 text-right font-semibold">Monto total</th>
            <th className="px-3 py-2 text-right font-semibold">Cobrado</th>
            <th className="px-3 py-2 text-right font-semibold">Saldo pendiente</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {/* Orden del array tal cual llega — FIFO canónico del backend (REQ-CXC-05). */}
          {ventas.map((venta) => (
            <tr
              key={venta.ventaId}
              className={cn(
                'hover:bg-muted/20',
                // Vencida: fondo destructive sutil ADEMÁS del badge con texto —
                // la señal nunca es solo color (§10, Anti-F-10: variable semántica).
                venta.vencida && 'bg-destructive/5',
              )}
            >
              <td className="px-3 py-2 whitespace-nowrap">
                {formatearFechaContable(venta.fechaContable)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {venta.fechaVencimiento !== null ? (
                  formatearFechaContable(venta.fechaVencimiento)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline">
                  {ESTADO_COMERCIAL_LABEL[venta.estadoComercial]}
                </Badge>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <AtrasoCell venta={venta} />
              </td>
              <td className="px-3 py-2 text-right">
                <Monto value={venta.montoTotal} />
              </td>
              <td className="px-3 py-2 text-right">
                <Monto value={venta.cobrado} />
              </td>
              <td className="px-3 py-2 text-right font-medium">
                <Monto value={venta.saldoPendiente} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/30 font-semibold">
            <td className="px-3 py-2" colSpan={6}>
              Total saldo pendiente
            </td>
            <td className="px-3 py-2 text-right">
              {/* Total del backend, sin sumar filas en el cliente (§4.5). */}
              <Monto value={totalSaldoPendiente} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
