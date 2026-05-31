import { TrendingUp, TrendingDown } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
// Cross-feature: reutilizamos el formateador de montos del Libro Mayor
// (es-BO, separador de miles "." y decimal ","). Ver frontend CLAUDE.md §14.6.
import { formatearMontoBob } from '@/features/libro-mayor/lib/formatear-monto-bob';
import type { EstadoResultadosResponse, SeccionResultados } from '@/types/api';

// ============================================================
// Props
// ============================================================

interface EstadoResultadosTablaProps {
  data: EstadoResultadosResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

// ============================================================
// Sub-componentes
// ============================================================

function TablaSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}

interface MontoBobProps {
  monto: string;
  className?: string;
  /** Cuenta contraria: el monto resta del grupo, se muestra entre paréntesis. */
  contraria?: boolean;
}

/**
 * Monto en BOB. Las cuentas contrarias se muestran entre paréntesis,
 * convención contable para valores que restan del grupo.
 */
function MontoBob({ monto, className, contraria = false }: MontoBobProps): React.JSX.Element {
  const formateado = formatearMontoBob(monto);
  return (
    <span className={cn('font-mono tabular-nums text-sm', className)}>
      <span className="text-muted-foreground text-xs mr-0.5">Bs</span>
      {contraria ? `(${formateado})` : formateado}
    </span>
  );
}

interface SeccionResultadosViewProps {
  seccion: SeccionResultados;
}

/**
 * Una sección raíz del Estado de Resultados (Ingresos o Egresos) con sus
 * subsecciones, cuentas hoja y total de sección.
 *
 * Las ramas vacías ya vienen podadas del backend (REQ-ER-08); si una sección
 * raíz no tiene subsecciones, se muestra un aviso de "sin movimientos".
 */
function SeccionResultadosView({ seccion }: SeccionResultadosViewProps): React.JSX.Element {
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{seccion.titulo}</h2>
        <MontoBob monto={seccion.totalBob} className="font-semibold" />
      </header>

      {seccion.subsecciones.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Sin movimientos en el período.
        </p>
      ) : (
        <div className="divide-y">
          {seccion.subsecciones.map((sub) => (
            <div key={sub.subClaseCuenta} className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {sub.titulo}
                </h3>
                <MontoBob monto={sub.totalBob} className="font-medium" />
              </div>

              <ul className="space-y-1.5">
                {sub.cuentas.map((cuenta) => (
                  // Anti-F-06: key estable (cuentaId).
                  <li
                    key={cuenta.cuentaId}
                    className="flex items-center justify-between gap-3 pl-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {cuenta.codigoInterno}
                      </span>
                      <span className="truncate text-sm">{cuenta.nombre}</span>
                      {cuenta.esContraria && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          contraria
                        </Badge>
                      )}
                    </div>
                    <MontoBob
                      monto={cuenta.saldoBob}
                      contraria={cuenta.esContraria}
                      className={cn(cuenta.esContraria && 'text-muted-foreground')}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface ResultadoFooterProps {
  data: EstadoResultadosResponse;
}

/**
 * Pie del Estado de Resultados: Resultado del Ejercicio = Σ Ingresos − Σ Egresos
 * del período (Código Tributario art. 47). Verde si es ganancia (esGanancia),
 * advertencia si es pérdida.
 *
 * CLAUDE.md §4.5: el monto llega como string. El único cálculo (valor absoluto
 * para presentación) es de display — el backend ya provee `esGanancia` y
 * `resultadoEjercicioBob` con signo como verdad; acá solo elegimos label/color.
 */
function ResultadoFooter({ data }: ResultadoFooterProps): React.JSX.Element {
  const resultadoAbsoluto = Math.abs(Number(data.resultadoEjercicioBob)).toFixed(2);

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-4',
        data.esGanancia ? 'border-border bg-muted/20' : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total Ingresos
            </span>
            <MontoBob monto={data.totalIngresoBob} className="text-base font-semibold" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total Egresos
            </span>
            <MontoBob monto={data.totalEgresoBob} className="text-base font-semibold" />
          </div>
        </div>

        {data.esGanancia ? (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {/* text-emerald-600: verde de éxito, misma convención que el cuadre
                de partida doble (comprobante-totales.tsx) y el Balance General. */}
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <span>
              Ganancia del ejercicio{' '}
              <MontoBob monto={resultadoAbsoluto} className="font-semibold" />
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <TrendingDown className="h-5 w-5" />
            <span>
              Pérdida del ejercicio{' '}
              <MontoBob monto={resultadoAbsoluto} className="font-semibold" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================

/**
 * Estado de Resultados (Income Statement): árbol Ingresos / Egresos de flujo del
 * período, con el Resultado del Ejercicio (ganancia o pérdida) al pie.
 *
 * Las ramas vacías ya vienen podadas del backend (REQ-ER-08).
 * Anti-F-10: variables semánticas del tema para dark mode.
 */
export function EstadoResultadosTabla({
  data,
  isLoading,
  isError,
}: EstadoResultadosTablaProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudo cargar el Estado de Resultados. Intentá de nuevo.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <TablaSkeleton />;
  }

  if (data === undefined) {
    return <TablaSkeleton />;
  }

  return (
    <div className="space-y-3">
      <SeccionResultadosView seccion={data.ingreso} />
      <SeccionResultadosView seccion={data.egreso} />
      <ResultadoFooter data={data} />
    </div>
  );
}
