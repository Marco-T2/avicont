import { AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { SaldoCuentaBancaria } from '@/types/api';

import { estaSaldoDesactualizado, resumirSaldosPorMoneda } from '../lib/saldos';

interface SaldosPorCuentaProps {
  saldos: SaldoCuentaBancaria[];
  /** Corte del rango consultado (`YYYY-MM-DD`) — contra él se marca la desactualización. */
  hasta: string;
}

/**
 * Franja de saldos vigentes por cuenta (REQ-VMB-08/09/10).
 *
 * La pregunta que responde es "cuánto tengo hoy para transferir", así que la
 * fecha del último movimiento se muestra SIEMPRE y un saldo anterior al corte
 * lleva marca visible de desactualización — no es decorativo: un saldo viejo
 * presentado como saldo de hoy es una respuesta incorrecta.
 *
 * `saldo=null` es null HONESTO (perfil que no publica saldo o cuenta sin
 * movimientos): se excluye de la suma con indicador, jamás se cuenta como 0.
 */
export function SaldosPorCuenta({ saldos, hasta }: SaldosPorCuentaProps): React.JSX.Element | null {
  if (saldos.length === 0) return null;

  const resumen = resumirSaldosPorMoneda(saldos);

  return (
    <section aria-label="Saldos por cuenta" className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Saldos por cuenta
      </h2>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {saldos.map((s) => {
          const desactualizado = estaSaldoDesactualizado(s.fechaUltimoMovimiento, hasta);

          return (
            <li key={s.cuentaBancariaId} className="rounded-md border px-3 py-2 space-y-1">
              <p className="text-sm font-medium">{s.alias}</p>

              {s.saldo !== null ? (
                <p className="text-base font-semibold tabular-nums">
                  {formatearMontoBob(s.saldo)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{s.moneda}</span>
                </p>
              ) : (
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  Sin saldo
                </Badge>
              )}

              {s.fechaUltimoMovimiento !== null ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>Últ. movimiento: {formatearFechaContable(s.fechaUltimoMovimiento)}</span>
                  {desactualizado && (
                    // Par claro/oscuro explícito (mismo criterio que estado-movimiento-badge).
                    <Badge
                      variant="outline"
                      className="font-normal text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      Desactualizado
                    </Badge>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin movimientos hasta el corte</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3">
        {resumen.map((r) => (
          <p key={r.moneda} className="text-sm">
            <span className="text-muted-foreground">Total {r.moneda}:</span>{' '}
            {r.suma !== null ? (
              <span className="font-semibold tabular-nums">{formatearMontoBob(r.suma)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {r.cuentasSinSaldo > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({r.cuentasSinSaldo}{' '}
                {r.cuentasSinSaldo === 1
                  ? 'cuenta sin saldo excluida'
                  : 'cuentas sin saldo excluidas'}
                )
              </span>
            )}
          </p>
        ))}
      </div>
    </section>
  );
}
