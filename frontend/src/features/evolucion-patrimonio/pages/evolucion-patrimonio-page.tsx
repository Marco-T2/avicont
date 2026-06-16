import { useState } from 'react';

// Cross-feature: perfil fiscal para la cabecera del export a Excel.
import { useEmpresa } from '@/features/tenants/hooks/use-empresa';

import { BotonExportarEvolucionPatrimonio } from '../components/boton-exportar-evolucion-patrimonio';
import { EvolucionPatrimonioFiltros } from '../components/evolucion-patrimonio-filtros';
import { EvolucionPatrimonioTabla } from '../components/evolucion-patrimonio-tabla';
import { useEvolucionPatrimonio } from '../hooks/use-evolucion-patrimonio';
import type { EvolucionPatrimonioFiltroValues } from '../schemas/evolucion-patrimonio-filtro-schema';

/**
 * Página del Estado de Evolución del Patrimonio Neto (EEPN).
 *
 * Orquesta filtros + tabla (patrón container/presentational, frontend
 * CLAUDE.md §3). El estado de los filtros vive acá (lifted state):
 * `EvolucionPatrimonioFiltros` lo emite vía onBuscar, la tabla lo consume.
 */
export function EvolucionPatrimonioPage(): React.JSX.Element {
  const [filtros, setFiltros] = useState<EvolucionPatrimonioFiltroValues | null>(null);

  const { data, isLoading, isFetching, isError } = useEvolucionPatrimonio(filtros);
  // Cross-feature: perfil fiscal para la cabecera del export a Excel.
  const { data: empresa } = useEmpresa();

  // Rango para el nombre del archivo: usa las fechas resueltas del response.
  const rango: string = data !== undefined ? `${data.fechaDesde}_${data.fechaHasta}` : 'sin-rango';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Evolución del Patrimonio</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Cómo se movió el patrimonio en el período: saldo inicial, resultado del ejercicio en
            curso, otros movimientos y saldo final por componente.
          </p>
        </div>
        <div className="self-start">
          <BotonExportarEvolucionPatrimonio data={data} perfil={empresa} rango={rango} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <EvolucionPatrimonioFiltros onBuscar={setFiltros} isFetching={isFetching} />
      </div>

      {filtros === null ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí un rango de fechas (o un período) y presioná{' '}
            <span className="font-medium">Consultar</span> para ver la Evolución del Patrimonio.
          </p>
        </div>
      ) : (
        <EvolucionPatrimonioTabla data={data} isLoading={isLoading} isError={isError} />
      )}
    </div>
  );
}
