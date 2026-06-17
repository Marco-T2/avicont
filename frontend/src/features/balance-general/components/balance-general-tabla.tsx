import { CheckCircle2, AlertTriangle } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
// Cross-feature: reutilizamos el formateador de montos del Libro Mayor
// (es-BO, separador de miles "." y decimal ","). Ver frontend CLAUDE.md §14.6.
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { BalanceGeneralResponse, SeccionBalance } from '@/types/api';

// ============================================================
// Props
// ============================================================

interface BalanceGeneralTablaProps {
  data: BalanceGeneralResponse | undefined;
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

interface SeccionBalanceViewProps {
  seccion: SeccionBalance;
}

/**
 * Una sección raíz del Balance (Activo, Pasivo o Patrimonio) con sus
 * subsecciones, cuentas hoja y total de sección.
 *
 * Las ramas vacías ya vienen podadas del backend (REQ-BG-15); si una sección
 * raíz no tiene subsecciones, se muestra un aviso de "sin saldos".
 */
function SeccionBalanceView({ seccion }: SeccionBalanceViewProps): React.JSX.Element {
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{seccion.titulo}</h2>
        <MontoBob monto={seccion.totalBob} className="font-semibold" />
      </header>

      {seccion.subsecciones.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Sin saldos a la fecha de corte.
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
                  <li
                    // Anti-F-06: key estable (cuentaId; null en la línea sintética).
                    key={cuenta.cuentaId ?? `sintetica-${cuenta.nombre}`}
                    className="flex items-center justify-between gap-3 pl-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {cuenta.codigoInterno !== null && (
                        <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {cuenta.codigoInterno}
                        </span>
                      )}
                      <span
                        className={cn(
                          'truncate text-sm',
                          cuenta.esSintetica && 'italic text-muted-foreground',
                        )}
                      >
                        {cuenta.nombre}
                      </span>
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

interface CuadreFooterProps {
  data: BalanceGeneralResponse;
}

/**
 * Pie de cuadre de la ecuación contable: Activo = Pasivo + Patrimonio
 * (Código Tributario art. 47, REQ-BG-08). Verde si cuadra, advertencia con la
 * diferencia si no.
 */
function CuadreFooter({ data }: CuadreFooterProps): React.JSX.Element {
  const pasivoMasPatrimonio = (
    Number(data.totalPasivoBob) + Number(data.totalPatrimonioBob)
  ).toFixed(2);

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
              Total Activo
            </span>
            <MontoBob monto={data.totalActivoBob} className="text-base font-semibold" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total Pasivo + Patrimonio
            </span>
            <MontoBob monto={pasivoMasPatrimonio} className="text-base font-semibold" />
          </div>
        </div>

        {data.cuadra ? (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {/* text-emerald-600: verde de éxito, misma convención que
                comprobante-totales.tsx para el cuadre de partida doble. */}
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            El balance cuadra
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>
              No cuadra · diferencia <MontoBob monto={data.diferenciaBob} className="font-semibold" />
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
 * Balance General (Estado de Situación Financiera): árbol Activo / Pasivo /
 * Patrimonio a una fecha de corte, con el Resultado del Ejercicio dentro del
 * Patrimonio y el cuadre de la ecuación contable al pie.
 *
 * Las ramas vacías ya vienen podadas del backend (REQ-BG-15).
 * CLAUDE.md §4.5: montos llegan como string — no se hace aritmética de dominio
 * sobre ellos; el único cálculo (Pasivo + Patrimonio para el cuadre visual) es
 * de presentación y el backend ya provee `cuadra`/`diferenciaBob` como verdad.
 * Anti-F-10: variables semánticas del tema para dark mode.
 */
export function BalanceGeneralTabla({
  data,
  isLoading,
  isError,
}: BalanceGeneralTablaProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudo cargar el Balance General. Intentá de nuevo.
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
      <SeccionBalanceView seccion={data.activo} />
      <SeccionBalanceView seccion={data.pasivo} />
      <SeccionBalanceView seccion={data.patrimonio} />
      <CuadreFooter data={data} />
    </div>
  );
}
