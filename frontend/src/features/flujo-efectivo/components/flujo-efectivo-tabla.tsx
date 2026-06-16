import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
// Cross-feature: reutilizamos el formateador de montos del Libro Mayor
// (es-BO, separador de miles "." y decimal ","). Ver frontend CLAUDE.md §14.6.
import { formatearMontoBob } from '@/features/libro-mayor/lib/formatear-monto-bob';
import type { EstadoFlujoEfectivoResponse } from '@/types/api';

import { etiquetaTipoFlujo } from '../lib/etiquetas-tipo-flujo';

interface FlujoEfectivoTablaProps {
  data: EstadoFlujoEfectivoResponse | undefined;
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

interface SeccionActividadProps {
  titulo: string;
  lineas: EstadoFlujoEfectivoResponse['operacion']['lineas'];
  subtotal: string;
  labelSubtotal: string;
}

/**
 * Sub-componente reutilizable para cada sección de actividad (Operación/Inversión/Financiación).
 *
 * DRY: las 3 secciones comparten la misma estructura; solo cambian título, líneas y subtotal.
 */
function SeccionActividad({
  titulo,
  lineas,
  subtotal,
  labelSubtotal,
}: SeccionActividadProps): React.JSX.Element {
  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div className="px-4 py-2.5 border-b bg-muted/30">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h2>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {lineas.map((linea) => (
            <tr
              // Anti-F-06: key estable (cuentaId ?? sintetica+nombre)
              key={linea.cuentaId ?? `sintetica-${linea.nombre}`}
              className="hover:bg-muted/20"
            >
              <td className="px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  {linea.codigoInterno !== null && (
                    <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {linea.codigoInterno}
                    </span>
                  )}
                  <span className="truncate">{linea.nombre}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {etiquetaTipoFlujo(linea.tipo)}
                  </Badge>
                </div>
              </td>
              <td className="px-4 py-2.5 text-right">
                <Monto monto={linea.monto} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-muted/30 font-semibold">
            <td className="px-4 py-2.5 text-left text-xs uppercase tracking-wide">
              {labelSubtotal}
            </td>
            <td className="px-4 py-2.5 text-right">
              <Monto monto={subtotal} className="font-semibold" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface ConciliacionFooterProps {
  data: EstadoFlujoEfectivoResponse;
}

/**
 * Bloque de conciliación del efectivo.
 *
 * El efectivo es el ANCLA de la conciliación, NO una cuarta sección (TRAMPA R3).
 * efectivoInicial + variacionNeta ≈ efectivoFinal (tolerancia ±Bs 0.01, resuelta en backend).
 * El front solo refleja el booleano `cuadra` del backend (§4.5 — no recalcula).
 */
function ConciliacionFooter({ data }: ConciliacionFooterProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-4 space-y-3',
        data.cuadra ? 'border-border bg-muted/20' : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Conciliación de efectivo
      </h2>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Efectivo inicial</span>
          <Monto monto={data.efectivoInicial} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Variación neta</span>
          <Monto monto={data.variacionNeta} />
        </div>
        <div className="flex items-center justify-between text-sm border-t pt-2">
          <span className="font-semibold">Efectivo final</span>
          <Monto monto={data.efectivoFinal} className="font-semibold text-base" />
        </div>
      </div>

      <div className="border-t pt-3">
        {data.cuadra ? (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {/* text-emerald-600: verde de éxito, misma convención que los demás EEFF. */}
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            El flujo cuadra
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>
              No cuadra · diferencia <Monto monto={data.diferencia} className="font-semibold" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface SenalesCalidadProps {
  advertencias: string[];
  cuentasEfectivoDetectadasPorHeuristica: EstadoFlujoEfectivoResponse['cuentasEfectivoDetectadasPorHeuristica'];
}

/**
 * Bloque de señales de calidad (TRAMPA R3 secundaria).
 *
 * Solo se renderiza si hay algo que mostrar; no generar ruido cuando los arrays están vacíos.
 * Anti-F-10: variables semánticas del tema para dark mode.
 */
function SenalesCalidad({
  advertencias,
  cuentasEfectivoDetectadasPorHeuristica,
}: SenalesCalidadProps): React.JSX.Element | null {
  const hayAlgo =
    advertencias.length > 0 || cuentasEfectivoDetectadasPorHeuristica.length > 0;
  if (!hayAlgo) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Señales de calidad
      </h2>

      {advertencias.length > 0 && (
        <ul className="space-y-1">
          {advertencias.map((adv, i) => (
            // index como key es aceptable acá: lista inmutable derivada del response
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
              {adv}
            </li>
          ))}
        </ul>
      )}

      {cuentasEfectivoDetectadasPorHeuristica.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Estas cuentas se identificaron como efectivo por heurística; marcá su{' '}
            <code className="text-xs bg-muted px-1 rounded">actividadFlujo</code> para mayor precisión.
          </p>
          <ul className="space-y-1">
            {cuentasEfectivoDetectadasPorHeuristica.map((c) => (
              <li key={c.cuentaId} className="text-sm text-muted-foreground font-mono">
                {c.codigoInterno} — {c.nombre}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Estado de Flujo de Efectivo (método indirecto) — tabla/bloques de presentación.
 *
 * Layout: resultado del ejercicio (punto de partida) → 3 secciones de actividad →
 * bloque de conciliación de efectivo → señales de calidad.
 *
 * §4.5: los montos llegan como string; no se hace aritmética en cliente.
 * Anti-F-10: variables semánticas del tema para dark mode.
 */
export function FlujoEfectivoTabla({
  data,
  isLoading,
  isError,
}: FlujoEfectivoTablaProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudo cargar el Flujo de Efectivo. Intentá de nuevo.
        </p>
      </div>
    );
  }

  if (isLoading || data === undefined) {
    return <TablaSkeleton />;
  }

  const totalLineas =
    data.operacion.lineas.length + data.inversion.lineas.length + data.financiacion.lineas.length;

  if (totalLineas === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay movimientos de flujo de efectivo en el período seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Punto de partida del método indirecto */}
      <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            Resultado del ejercicio
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Punto de partida del método indirecto
          </p>
        </div>
        <Monto monto={data.resultadoEjercicio} className="text-base font-semibold" />
      </div>

      {/* 3 secciones de actividad */}
      <SeccionActividad
        titulo="Actividades de Operación"
        lineas={data.operacion.lineas}
        subtotal={data.operacion.subtotal}
        labelSubtotal="Subtotal Operación"
      />
      <SeccionActividad
        titulo="Actividades de Inversión"
        lineas={data.inversion.lineas}
        subtotal={data.inversion.subtotal}
        labelSubtotal="Subtotal Inversión"
      />
      <SeccionActividad
        titulo="Actividades de Financiación"
        lineas={data.financiacion.lineas}
        subtotal={data.financiacion.subtotal}
        labelSubtotal="Subtotal Financiación"
      />

      {/* Bloque de conciliación (efectivo = ancla, NO sección adicional) */}
      <ConciliacionFooter data={data} />

      {/* Señales de calidad — solo si hay algo */}
      <SenalesCalidad
        advertencias={data.advertencias}
        cuentasEfectivoDetectadasPorHeuristica={data.cuentasEfectivoDetectadasPorHeuristica}
      />
    </div>
  );
}
