import { Wallet } from 'lucide-react';

// Cross-feature: formateadores transversales de presentación (§4.5 / §4.6).
// formatearFechaContable pin-ea America/La_Paz y evita el corrimiento UTC.
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';

// ============================================================
// Props
// ============================================================

interface EstadoCuentaResumenProps {
  razonSocial: string;
  /** YYYY-MM-DD — el "hoy" del ClockPort del backend con el que se derivaron
   *  vencimiento y atraso. NO se deriva ni se recalcula en el cliente (§4.6). */
  fechaCorte: string;
  /** String decimal del backend, se renderiza sin recalcular (§4.5). */
  totalSaldoPendiente: string;
  /** Σ saldos no aplicados de los cobros del contacto (anticipos). String §4.5. */
  saldoAFavor: string;
}

// ============================================================
// Componente
// ============================================================

/**
 * Cabecera del estado de cuenta (REQ-CXC-07): razón social + fecha de corte
 * + los dos totales que publica el backend.
 *
 * §4.5: `totalSaldoPendiente` y `saldoAFavor` llegan como string y se muestran
 * tal cual (formateo es-BO de display, sin aritmética). El único `Number()` es
 * la comparación visual con cero para atenuar el estilo — nunca esconde el dato:
 * un saldo a favor de "0.00" también es información.
 */
export function EstadoCuentaResumen({
  razonSocial,
  fechaCorte,
  totalSaldoPendiente,
  saldoAFavor,
}: EstadoCuentaResumenProps): React.JSX.Element {
  const tieneSaldoAFavor = Number(saldoAFavor) !== 0;

  return (
    <section className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-lg font-semibold">{razonSocial}</h2>
        <p className="text-sm text-muted-foreground">
          Saldos al{' '}
          <span className="font-medium text-foreground">
            {formatearFechaContable(fechaCorte)}
          </span>{' '}
          (fecha de corte)
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-muted/20 px-4 py-3">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Saldo pendiente total
          </dt>
          <dd className="mt-1 font-mono tabular-nums text-xl font-semibold">
            <span className="text-sm text-muted-foreground mr-1">Bs</span>
            {formatearMontoBob(totalSaldoPendiente)}
          </dd>
        </div>

        <div className="rounded-md border bg-muted/20 px-4 py-3">
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Saldo a favor del cliente (anticipos)
          </dt>
          <dd
            className={
              tieneSaldoAFavor
                ? 'mt-1 font-mono tabular-nums text-xl font-semibold'
                : 'mt-1 font-mono tabular-nums text-xl font-semibold text-muted-foreground'
            }
          >
            <span className="text-sm text-muted-foreground mr-1">Bs</span>
            {formatearMontoBob(saldoAFavor)}
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">
            Cobros del cliente todavía no imputados a ninguna venta.
          </p>
        </div>
      </dl>
    </section>
  );
}
