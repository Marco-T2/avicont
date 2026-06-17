import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
// Cross-feature: reutilizamos el formateador de montos del Libro Mayor
// (es-BO, separador de miles "." y decimal ","). Ver frontend CLAUDE.md §14.6.
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import { cn } from '@/lib/utils';
import type { BalanceComprobacionResponse } from '@/types/api';

// ============================================================
// Props
// ============================================================

interface BalanceComprobacionTablaProps {
  data: BalanceComprobacionResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

// ============================================================
// Sub-componentes
// ============================================================

function TablaSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Monto BOB alineado a la derecha (convención contable). "—" para el cero. */
function Monto({ value }: { value: string }): React.JSX.Element {
  const esCero = Number(value) === 0;
  return (
    <span className="font-mono tabular-nums text-sm">
      {esCero ? <span className="text-muted-foreground">—</span> : formatearMontoBob(value)}
    </span>
  );
}

/**
 * Pie de cuadre del Balance de Comprobación (REQ-BC-06):
 * Σ saldosDeudores == Σ saldosAcreedores (consecuencia de la partida doble,
 * Código Tributario art. 47). Verde si cuadra, advertencia con la diferencia si no.
 */
function CuadreFooter({ data }: { data: BalanceComprobacionResponse }): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-4',
        data.cuadra ? 'border-border bg-muted/20' : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Diferencia de sumas
            </span>
            <Monto value={data.diferenciaSumas} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Diferencia de saldos
            </span>
            <Monto value={data.diferenciaSaldos} />
          </div>
        </div>

        {data.cuadra ? (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {/* text-emerald-600: verde de éxito, misma convención que el Balance
                General y comprobante-totales.tsx para el cuadre de partida doble. */}
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            El balance cuadra
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>No cuadra · revisar la integridad de la partida doble</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Señal de calidad para el contador (REQ-BC-07): cuentas cuyo saldo cayó del
 * lado OPUESTO a su naturaleza (anticipos no reclasificados, errores de carga).
 * No afecta los totales — es una lista de "revisar".
 */
function NaturalezaOpuestaSection({
  data,
}: {
  data: BalanceComprobacionResponse;
}): React.JSX.Element | null {
  if (data.cuentasNaturalezaOpuesta.length === 0) return null;

  return (
    // amber: estado de "atención/revisar" (ni éxito ni error). No hay variable de
    // tema para warning; se documenta el literal como excepción consciente (Anti-F-10).
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 overflow-hidden">
      <header className="flex items-center gap-2 border-b border-amber-500/30 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
        <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          Cuentas con saldo de naturaleza opuesta — revisar
        </h2>
        <Badge variant="outline" className="ml-auto text-xs">
          {data.cuentasNaturalezaOpuesta.length}
        </Badge>
      </header>
      <ul className="divide-y divide-amber-500/20">
        {data.cuentasNaturalezaOpuesta.map((c) => (
          <li
            key={c.cuentaId}
            className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                {c.codigoInterno}
              </span>
              <span className="truncate">{c.nombre}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {c.naturaleza}
              </Badge>
            </div>
            <Monto value={c.saldoOpuesto} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================
// Componente principal
// ============================================================

/**
 * Balance de Comprobación de Sumas y Saldos: lista plana de las cuentas de
 * detalle con movimiento en el rango (REQ-BC-04), con 4 columnas por cuenta
 * (Sumas Débito/Crédito + Saldo Deudor/Acreedor), totales, cuadre y la sección
 * de cuentas de naturaleza opuesta.
 *
 * §4.5: montos llegan como string — no se hace aritmética de dominio sobre ellos
 * (el único `Number()` es la comparación visual con cero). El backend ya provee
 * los totales y `cuadra` como verdad.
 * Anti-F-10: variables semánticas del tema (salvo emerald/amber documentados).
 */
export function BalanceComprobacionTabla({
  data,
  isLoading,
  isError,
}: BalanceComprobacionTablaProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudo cargar el Balance de Comprobación. Intentá de nuevo.
        </p>
      </div>
    );
  }

  if (isLoading || data === undefined) {
    return <TablaSkeleton />;
  }

  if (data.lineas.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay cuentas con movimiento en el rango seleccionado.
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
              <th className="px-3 py-2 text-left font-semibold">Código</th>
              <th className="px-3 py-2 text-left font-semibold">Cuenta</th>
              <th className="px-3 py-2 text-right font-semibold">Sumas Débito</th>
              <th className="px-3 py-2 text-right font-semibold">Sumas Crédito</th>
              <th className="px-3 py-2 text-right font-semibold">Saldo Deudor</th>
              <th className="px-3 py-2 text-right font-semibold">Saldo Acreedor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.lineas.map((linea) => (
              <tr key={linea.cuentaId} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {linea.codigoInterno}
                </td>
                <td className="px-3 py-2">{linea.nombre}</td>
                <td className="px-3 py-2 text-right">
                  <Monto value={linea.sumasDebito} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Monto value={linea.sumasCredito} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Monto value={linea.saldoDeudor} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Monto value={linea.saldoAcreedor} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Totales
              </td>
              <td className="px-3 py-2 text-right">
                <Monto value={data.totalSumasDebito} />
              </td>
              <td className="px-3 py-2 text-right">
                <Monto value={data.totalSumasCredito} />
              </td>
              <td className="px-3 py-2 text-right">
                <Monto value={data.totalSaldoDeudor} />
              </td>
              <td className="px-3 py-2 text-right">
                <Monto value={data.totalSaldoAcreedor} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <CuadreFooter data={data} />
      <NaturalezaOpuestaSection data={data} />
    </div>
  );
}
