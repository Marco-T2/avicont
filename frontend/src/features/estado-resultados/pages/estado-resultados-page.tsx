import { useState } from 'react';

// Cross-feature: perfil fiscal para la cabecera del export a Excel.
import { useEmpresa } from '@/features/tenants/hooks/use-empresa';

import { BotonExportarEstadoResultados } from '../components/boton-exportar-estado-resultados';
import { EstadoResultadosFiltros } from '../components/estado-resultados-filtros';
import { EstadoResultadosTabla } from '../components/estado-resultados-tabla';
import { useEstadoResultados } from '../hooks/use-estado-resultados';
import type { EstadoResultadosFiltroValues } from '../schemas/estado-resultados-filtro-schema';

// ============================================================
// Página del Estado de Resultados
// ============================================================

/**
 * Página del Estado de Resultados — Income Statement (REQ-ER-01..12).
 *
 * Orquesta filtros + tabla. El estado de los filtros vive acá (lifted state):
 * `EstadoResultadosFiltros` lo emite vía onBuscar, `EstadoResultadosTabla` lo
 * consume.
 *
 * Patrón container/presentational (frontend CLAUDE.md §3) — Anti-F-11.
 */
export function EstadoResultadosPage(): React.JSX.Element {
  const [filtros, setFiltros] = useState<EstadoResultadosFiltroValues | null>(null);

  const { data, isLoading, isFetching, isError } = useEstadoResultados(filtros);
  // Cross-feature: perfil fiscal para la cabecera del export a Excel.
  const { data: empresa } = useEmpresa();

  // Rango para el nombre del archivo: fechaDesde_fechaHasta del response o filtro.
  const rango: string =
    data !== undefined
      ? `${data.fechaDesde}_${data.fechaHasta}`
      : filtros !== null
        ? `${filtros.fechaDesde}_${filtros.fechaHasta}`
        : 'sin-rango';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Estado de Resultados</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Ingresos y Egresos del período, con el Resultado del Ejercicio (ganancia o pérdida).
          </p>
        </div>
        <div className="self-start">
          <BotonExportarEstadoResultados data={data} perfil={empresa} rango={rango} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <EstadoResultadosFiltros onBuscar={setFiltros} isFetching={isFetching} />
      </div>

      {filtros === null ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí un rango de fechas y presioná <span className="font-medium">Consultar</span> para
            ver el Estado de Resultados.
          </p>
        </div>
      ) : (
        <EstadoResultadosTabla data={data} isLoading={isLoading} isError={isError} />
      )}
    </div>
  );
}
