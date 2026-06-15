import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
// Cross-feature: reutilizamos el formateador de montos del Libro Mayor
// (es-BO, separador de miles "." y decimal ","). Ver frontend CLAUDE.md §14.6.
import { formatearMontoBob } from '@/features/libro-mayor/lib/formatear-monto-bob';
import { cn } from '@/lib/utils';
import type { HojaTrabajoResponse } from '@/types/api';

// ============================================================
// Props
// ============================================================

interface HojaTrabajoTablaProps {
  data: HojaTrabajoResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

type LineaHojaTrabajo = HojaTrabajoResponse['lineas'][number];

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
    <span className="font-mono tabular-nums text-xs">
      {esCero ? <span className="text-muted-foreground">—</span> : formatearMontoBob(value)}
    </span>
  );
}

/** Las 12 celdas de montos de una línea, en el orden de los 6 pares de columnas. */
function CeldasMonto({ linea }: { linea: LineaHojaTrabajo }): React.JSX.Element {
  const montos: string[] = [
    linea.sumasDebe,
    linea.sumasHaber,
    linea.saldoDeudor,
    linea.saldoAcreedor,
    linea.ajustesDebe,
    linea.ajustesHaber,
    linea.saldoAjustadoDeudor,
    linea.saldoAjustadoAcreedor,
    linea.erPerdidas,
    linea.erGanancias,
    linea.bgActivo,
    linea.bgPasPat,
  ];
  return (
    <>
      {montos.map((m, i) => (
        <td
          key={i}
          className={cn(
            'px-2 py-2 text-right whitespace-nowrap',
            // Separador visual al inicio de cada par (cada 2 columnas).
            i % 2 === 0 && 'border-l border-border/60',
          )}
        >
          <Monto value={m} />
        </td>
      ))}
    </>
  );
}

const GRUPOS: ReadonlyArray<{ titulo: string; sub: [string, string] }> = [
  { titulo: 'Sumas', sub: ['Debe', 'Haber'] },
  { titulo: 'Saldos', sub: ['Deudor', 'Acreedor'] },
  { titulo: 'Ajustes', sub: ['Debe', 'Haber'] },
  { titulo: 'Saldos Ajustados', sub: ['Deudor', 'Acreedor'] },
  { titulo: 'Estado de Resultados', sub: ['Pérdidas', 'Ganancias'] },
  { titulo: 'Balance General', sub: ['Activo', 'Pas. + Patrim.'] },
];

/** Encabezado de 2 niveles: grupos (colspan 2) + sub-columnas Debe/Haber, etc. */
function EncabezadoAgrupado(): React.JSX.Element {
  return (
    <thead className="text-xs text-muted-foreground">
      <tr className="border-b bg-muted/30">
        <th rowSpan={2} className="px-3 py-2 text-left font-semibold align-bottom">
          Código
        </th>
        <th rowSpan={2} className="px-3 py-2 text-left font-semibold align-bottom">
          Cuenta
        </th>
        {GRUPOS.map((g) => (
          <th
            key={g.titulo}
            colSpan={2}
            className="px-2 py-1.5 text-center font-semibold uppercase tracking-wide border-l border-border/60"
          >
            {g.titulo}
          </th>
        ))}
      </tr>
      <tr className="border-b bg-muted/20">
        {GRUPOS.flatMap((g, gi) =>
          g.sub.map((s, si) => (
            <th
              key={`${gi}-${si}`}
              className={cn(
                'px-2 py-1.5 text-right font-medium whitespace-nowrap',
                si === 0 && 'border-l border-border/60',
              )}
            >
              {s}
            </th>
          )),
        )}
      </tr>
    </thead>
  );
}

/**
 * Pie de control de cuadre de la Hoja de Trabajo: los 6 cuadres parciales
 * (Sumas, Saldos, Ajustes, Saldos Ajustados, Estado de Resultados, Balance
 * General) más el cuadre global `cuadra` (AND de los 6, ±Bs 0.01).
 */
function CuadreFooter({ data }: { data: HojaTrabajoResponse }): React.JSX.Element {
  const c = data.cuadres;
  const partes: ReadonlyArray<{ etiqueta: string; ok: boolean; diferencia: string }> = [
    { etiqueta: 'Sumas', ok: c.cuadraSumas, diferencia: c.diferenciaSumas },
    { etiqueta: 'Saldos', ok: c.cuadraSaldos, diferencia: c.diferenciaSaldos },
    { etiqueta: 'Ajustes', ok: c.cuadraAjustes, diferencia: c.diferenciaAjustes },
    {
      etiqueta: 'Saldos ajustados',
      ok: c.cuadraSaldosAjustados,
      diferencia: c.diferenciaSaldosAjustados,
    },
    {
      etiqueta: 'Estado de Resultados',
      ok: c.cuadraEstadoResultados,
      diferencia: c.diferenciaEstadoResultados,
    },
    {
      etiqueta: 'Balance General',
      ok: c.cuadraBalanceGeneral,
      diferencia: c.diferenciaBalanceGeneral,
    },
  ];

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-4',
        c.cuadra ? 'border-border bg-muted/20' : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        {c.cuadra ? (
          // text-emerald-600: verde de éxito, misma convención que el Balance
          // General y comprobante-totales.tsx para el cuadre de partida doble.
          <>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium">La hoja de trabajo cuadra</span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              No cuadra · revisar los controles marcados
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {partes.map((p) => (
          <div key={p.etiqueta} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {p.etiqueta}
            </span>
            <div className="flex items-center gap-1.5">
              {p.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              )}
              <Monto value={p.diferencia} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Señal de calidad para el contador: cuentas cuyo saldo cayó del lado OPUESTO a
 * su naturaleza (anticipos no reclasificados, errores de carga). No afecta los
 * totales — es una lista de "revisar".
 */
function NaturalezaOpuestaSection({
  data,
}: {
  data: HojaTrabajoResponse;
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
 * Hoja de Trabajo de 12 columnas: lista plana de las cuentas de detalle con
 * movimiento en el rango más la fila sintética de Utilidad/Pérdida del Ejercicio
 * (`esSintetica`), con 6 pares de columnas (Sumas / Saldos / Ajustes / Saldos
 * Ajustados / Estado de Resultados / Balance General), totales, los 6 cuadres y
 * la sección de cuentas de naturaleza opuesta.
 *
 * §4.5: montos llegan como string — no se hace aritmética de dominio sobre ellos
 * (el único `Number()` es la comparación visual con cero). El backend ya provee
 * los totales y los cuadres como verdad.
 * Anti-F-10: variables semánticas del tema (salvo emerald/amber documentados).
 */
export function HojaTrabajoTabla({
  data,
  isLoading,
  isError,
}: HojaTrabajoTablaProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudo cargar la Hoja de Trabajo. Intentá de nuevo.
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

  const totales = data.totales;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full min-w-[1280px] text-sm">
          <EncabezadoAgrupado />
          <tbody className="divide-y">
            {data.lineas.map((linea, idx) => (
              <tr
                key={linea.cuentaId ?? `sintetica-${idx}`}
                className={cn(
                  'hover:bg-muted/20',
                  // La fila sintética (Utilidad/Pérdida del Ejercicio) se destaca:
                  // cierra el ER y el BG, no es una cuenta real del plan.
                  linea.esSintetica && 'bg-muted/40 font-medium italic',
                )}
              >
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {linea.codigoInterno}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    {linea.nombre}
                    {linea.esContraria && (
                      <Badge variant="outline" className="text-[10px]">
                        contraria
                      </Badge>
                    )}
                  </span>
                </td>
                <CeldasMonto linea={linea} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Totales
              </td>
              {[
                totales.sumasDebe,
                totales.sumasHaber,
                totales.saldoDeudor,
                totales.saldoAcreedor,
                totales.ajustesDebe,
                totales.ajustesHaber,
                totales.saldoAjustadoDeudor,
                totales.saldoAjustadoAcreedor,
                totales.perdidas,
                totales.ganancias,
                totales.activo,
                totales.pasivoPatrimonio,
              ].map((m, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-2 py-2 text-right whitespace-nowrap',
                    i % 2 === 0 && 'border-l border-border/60',
                  )}
                >
                  <Monto value={m} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <CuadreFooter data={data} />
      <NaturalezaOpuestaSection data={data} />
    </div>
  );
}
