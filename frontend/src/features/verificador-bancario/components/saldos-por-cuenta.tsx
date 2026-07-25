import { AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { ResumenSaldosMoneda, SaldoCuentaBancaria, TotalMoneda } from '@/types/api';

import { diasDeAtrasoDelSaldo, estaSaldoDesactualizado } from '../lib/saldos';

interface SaldosPorCuentaProps {
  saldos: SaldoCuentaBancaria[];
  /** Agregado por moneda calculado por el BACKEND — se presenta tal cual, sin recalcular. */
  resumen: ResumenSaldosMoneda[];
  /**
   * Débitos/créditos del rango, por moneda, también calculados por el BACKEND.
   * Comparten la fila de resumen con el saldo para no gastar dos franjas en
   * cuatro números — pero son magnitudes DISTINTAS y los labels lo dicen: el
   * saldo es un stock (cuánto hay), débitos y créditos son un flujo (cuánto se
   * movió en el rango). No se suman entre sí.
   */
  totales: TotalMoneda[];
  /** Corte del rango consultado (`YYYY-MM-DD`) — contra él se marca la desactualización. */
  hasta: string;
}

interface FilaResumen {
  moneda: string;
  saldo: ResumenSaldosMoneda | undefined;
  flujo: TotalMoneda | undefined;
}

/**
 * Une saldos y totales por moneda.
 *
 * Itera la UNIÓN y no solo `resumen`: los saldos se agregan desde las CUENTAS y
 * los totales desde los MOVIMIENTOS, así que aunque hoy toda moneda con
 * movimientos tenga su cuenta, apoyarse en eso haría desaparecer una fila
 * entera si el día de mañana deja de valer. El orden de `resumen` manda (lo fija
 * el backend); las monedas que solo aparecen en `totales` van al final.
 */
function unirPorMoneda(
  resumen: ResumenSaldosMoneda[],
  totales: TotalMoneda[],
): FilaResumen[] {
  const monedas = [
    ...resumen.map((r) => r.moneda),
    ...totales.map((t) => t.moneda).filter((m) => !resumen.some((r) => r.moneda === m)),
  ];

  return monedas.map((moneda) => ({
    moneda,
    saldo: resumen.find((r) => r.moneda === moneda),
    flujo: totales.find((t) => t.moneda === moneda),
  }));
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
 * movimientos): el backend lo excluye de la suma, acá solo se le da indicador.
 * Los subtotales por moneda llegan en `resumen` (`saldosPorMoneda`) y se
 * muestran SIN sumar nada en el cliente — mismo criterio anti-recálculo que
 * `lib/export-excel`.
 */
export function SaldosPorCuenta({
  saldos,
  resumen,
  totales,
  hasta,
}: SaldosPorCuentaProps): React.JSX.Element | null {
  // Ambos vacíos y no hay nada que mostrar. La condición mira LAS DOS fuentes:
  // los totales viven acá desde que se fusionaron las dos franjas, y un
  // `saldos.length === 0` a secas los haría desaparecer de la pantalla.
  if (saldos.length === 0 && totales.length === 0) return null;

  const filas = unirPorMoneda(resumen, totales);

  return (
    <section aria-label="Saldos por cuenta" className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Saldos por cuenta
      </h2>

      {saldos.length > 0 && (
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {saldos.map((s) => {
          const desactualizado = estaSaldoDesactualizado(s.fechaUltimoMovimiento, hasta);
          const diasAtraso = diasDeAtrasoDelSaldo(s.fechaUltimoMovimiento, hasta);

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
                    // Se muestra la MAGNITUD del atraso: "hace 85 días" es
                    // accionable ("faltan extractos"), un badge pelado no.
                    <Badge
                      variant="outline"
                      className="font-normal text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      Desactualizado · {diasAtraso} días
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
      )}

      {/* Una fila por moneda con saldo + flujo del rango. Antes eran DOS franjas
          apiladas (el total acá y los débitos/créditos en una tarjeta aparte)
          para cuatro números por moneda. `gap-y-2` separa las monedas cuando
          hay más de una y la fila envuelve. */}
      <div className="space-y-1 border-t pt-3">
        {filas.map((f) => (
          <p key={f.moneda} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            {f.saldo !== undefined && (
              <span>
                <span className="text-muted-foreground">Total {f.moneda}:</span>{' '}
                {f.saldo.suma !== null ? (
                  <span className="font-semibold tabular-nums">
                    {formatearMontoBob(f.saldo.suma)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {f.saldo.cuentasSinSaldo > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({f.saldo.cuentasSinSaldo}{' '}
                    {f.saldo.cuentasSinSaldo === 1
                      ? 'cuenta sin saldo excluida'
                      : 'cuentas sin saldo excluidas'}
                    )
                  </span>
                )}
              </span>
            )}

            {f.flujo !== undefined && (
              <>
                <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
                <span>
                  <span className="text-muted-foreground">Débitos:</span>{' '}
                  <span className="tabular-nums">{formatearMontoBob(f.flujo.totalDebitos)}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Créditos:</span>{' '}
                  <span className="tabular-nums">{formatearMontoBob(f.flujo.totalCreditos)}</span>
                </span>
                {/* El conteo solo aporta cuando discrimina entre monedas: con una
                    sola duplica el "N en total" de la cabecera de la tabla. */}
                {filas.length > 1 && (
                  <span className="text-xs text-muted-foreground">
                    {f.flujo.cantidad}{' '}
                    {f.flujo.cantidad === 1 ? 'movimiento' : 'movimientos'}
                  </span>
                )}
              </>
            )}

            {/* Moneda que solo aparece en totales: el label lo aclara en vez de
                mostrar los números sin contexto. */}
            {f.saldo === undefined && (
              <span className="text-xs text-muted-foreground">
                ({f.moneda} — sin cuentas con saldo)
              </span>
            )}
          </p>
        ))}
      </div>
    </section>
  );
}
