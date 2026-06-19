import { useState } from 'react';

// Cross-feature: perfil fiscal para la cabecera del export a Excel.
import { useEmpresa } from '@/features/tenants/hooks/use-empresa';

import { BotonExportarHojaTrabajo } from '../components/boton-exportar-hoja-trabajo';
import { HojaTrabajoFiltros } from '../components/hoja-trabajo-filtros';
import { HojaTrabajoTabla } from '../components/hoja-trabajo-tabla';
import { useHojaTrabajo } from '../hooks/use-hoja-trabajo';
import type { HojaTrabajoFiltroValues } from '../schemas/hoja-trabajo-filtro-schema';

// ============================================================
// Página de la Hoja de Trabajo de 12 columnas
// ============================================================

/**
 * Página de la Hoja de Trabajo de 12 columnas.
 *
 * Orquesta filtros + tabla (patrón container/presentational, frontend
 * CLAUDE.md §3 — Anti-F-11). El estado de los filtros vive acá (lifted state):
 * `HojaTrabajoFiltros` lo emite vía onBuscar, la tabla lo consume.
 */
export function HojaTrabajoPage(): React.JSX.Element {
  const [params, setParams] = useState<HojaTrabajoFiltroValues | null>(null);

  const { data, isLoading, isFetching, isError } = useHojaTrabajo(params);
  // Cross-feature: perfil fiscal para la cabecera del export a Excel.
  const { data: empresa } = useEmpresa();

  function handleBuscar(values: HojaTrabajoFiltroValues): void {
    setParams(values);
  }

  // tieneParams: truthy check sobre las fechas (string no vacío).
  // Evita el bug donde undefined !== undefined daba false pero string vacío pasaba.
  const tieneParams = Boolean(params?.fechaDesde && params?.fechaHasta);

  // Rango para el nombre del archivo: usa las fechas resueltas del response.
  const rango: string =
    data !== undefined ? `${data.fechaDesde}_${data.fechaHasta}` : 'sin-rango';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Hoja de Trabajo</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Las 12 columnas del cierre — Sumas, Saldos, Ajustes, Saldos Ajustados, Estado de
            Resultados y Balance General — con la utilidad o pérdida del ejercicio que cuadra
            las dos últimas secciones.
          </p>
        </div>
        <div className="self-start">
          <BotonExportarHojaTrabajo data={data} perfil={empresa} rango={rango} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <HojaTrabajoFiltros onBuscar={handleBuscar} isFetching={isFetching} />
      </div>

      {tieneParams ? (
        <HojaTrabajoTabla data={data} isLoading={isLoading} isError={isError} />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí un período o rango de fechas y presioná{' '}
            <span className="font-medium">Consultar</span> para ver la Hoja de Trabajo.
          </p>
        </div>
      )}
    </div>
  );
}
