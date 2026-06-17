import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
// Cross-feature: reutilizamos el formateador de montos del Libro Mayor
// (es-BO, separador de miles "." y decimal ","). Ver frontend CLAUDE.md §14.6.
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { EvolucionPatrimonioResponse } from '@/types/api';

interface EvolucionPatrimonioTablaProps {
  data: EvolucionPatrimonioResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

function TablaSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/** Monto en BOB alineado a la derecha (montos siempre a la derecha, §4.5). */
function Monto({ monto, className }: { monto: string; className?: string }): React.JSX.Element {
  return (
    <span className={cn('font-mono tabular-nums text-sm whitespace-nowrap', className)}>
      <span className="text-muted-foreground text-xs mr-0.5">Bs</span>
      {formatearMontoBob(monto)}
    </span>
  );
}

interface CuadreFooterProps {
  data: EvolucionPatrimonioResponse;
}

/**
 * Pie de cuadre de la evolución: saldoInicial + resultado + otrosMovimientos =
 * saldoFinal. Verde si cuadra, advertencia con la diferencia si no.
 * El backend ya provee `cuadra`/`diferenciaBob` como verdad (§4.5).
 */
function CuadreFooter({ data }: CuadreFooterProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-4',
        data.cuadra ? 'border-border bg-muted/20' : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Patrimonio al cierre
          </span>
          <Monto monto={data.totales.saldoFinalBob} className="text-base font-semibold" />
        </div>

        {data.cuadra ? (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {/* text-emerald-600: verde de éxito, misma convención que el Balance General. */}
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            La evolución cuadra
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>
              No cuadra · diferencia <Monto monto={data.diferenciaBob} className="font-semibold" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Estado de Evolución del Patrimonio Neto (nivel A+): por cada componente del
 * patrimonio, su saldo inicial, el resultado del ejercicio imputado (solo la
 * columna sintética), los otros movimientos del período y el saldo final.
 *
 * §4.5: los montos llegan como string; no se hace aritmética de dominio sobre
 * ellos. El backend provee los totales y el cuadre como verdad.
 * Anti-F-10: variables semánticas del tema para dark mode.
 * Tabla ancha → scroll horizontal en mobile (frontend CLAUDE.md §7).
 */
export function EvolucionPatrimonioTabla({
  data,
  isLoading,
  isError,
}: EvolucionPatrimonioTablaProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudo cargar la Evolución del Patrimonio. Intentá de nuevo.
        </p>
      </div>
    );
  }

  if (isLoading || data === undefined) {
    return <TablaSkeleton />;
  }

  if (data.componentes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay movimientos de patrimonio en el período seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-semibold">Componente</th>
              <th className="px-4 py-2.5 text-right font-semibold">Saldo inicial</th>
              <th className="px-4 py-2.5 text-right font-semibold">Resultado del ejercicio</th>
              <th className="px-4 py-2.5 text-right font-semibold">Otros movimientos</th>
              <th className="px-4 py-2.5 text-right font-semibold">Saldo final</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.componentes.map((c) => (
              <tr
                // Anti-F-06: key estable (cuentaId; null en la columna sintética).
                key={c.cuentaId ?? `sintetica-${c.nombre}`}
                className="hover:bg-muted/20"
              >
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {c.codigoInterno !== null && (
                      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {c.codigoInterno}
                      </span>
                    )}
                    <span className={cn('truncate', c.esSintetica && 'italic text-muted-foreground')}>
                      {c.nombre}
                    </span>
                    {c.esContraria && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        contraria
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Monto monto={c.saldoInicialBob} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Monto
                    monto={c.resultadoEjercicioBob}
                    className={cn(c.esSintetica && 'font-medium')}
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Monto monto={c.otrosMovimientosBob} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Monto monto={c.saldoFinalBob} className="font-medium" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-4 py-2.5 text-left uppercase text-xs tracking-wide">Total</td>
              <td className="px-4 py-2.5 text-right">
                <Monto monto={data.totales.saldoInicialBob} className="font-semibold" />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Monto monto={data.totales.resultadoEjercicioBob} className="font-semibold" />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Monto monto={data.totales.otrosMovimientosBob} className="font-semibold" />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Monto monto={data.totales.saldoFinalBob} className="font-semibold" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <CuadreFooter data={data} />
    </div>
  );
}
