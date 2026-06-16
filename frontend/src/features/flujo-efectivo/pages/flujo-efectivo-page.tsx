import { useState } from 'react';

// Cross-feature: perfil fiscal para la cabecera del export a Excel.
import { useEmpresa } from '@/features/tenants/hooks/use-empresa';

import { BotonExportarFlujoEfectivo } from '../components/boton-exportar-flujo-efectivo';
import { FlujoEfectivoFiltros } from '../components/flujo-efectivo-filtros';
import { FlujoEfectivoTabla } from '../components/flujo-efectivo-tabla';
import { useFlujoEfectivo } from '../hooks/use-flujo-efectivo';
import type { FlujoEfectivoFiltroValues } from '../schemas/flujo-efectivo-filtro-schema';

/**
 * Página del Estado de Flujo de Efectivo (EFE) por método indirecto.
 *
 * Orquesta filtros + tabla (patrón container/presentational, frontend CLAUDE.md §3).
 * El estado de los filtros vive acá (lifted state): `FlujoEfectivoFiltros` lo emite
 * vía onBuscar, la tabla lo consume.
 *
 * Método indirecto: parte del resultado del ejercicio y lo ajusta con partidas no
 * monetarias y variaciones de capital de trabajo para llegar al flujo de efectivo.
 */
export function FlujoEfectivoPage(): React.JSX.Element {
  const [filtros, setFiltros] = useState<FlujoEfectivoFiltroValues | null>(null);

  const { data, isLoading, isFetching, isError } = useFlujoEfectivo(filtros);
  // Cross-feature: perfil fiscal para la cabecera del export a Excel.
  const { data: empresa } = useEmpresa();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Estado de Flujo de Efectivo</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Método indirecto: cómo se generó y utilizó el efectivo durante el período,
            partiendo del resultado del ejercicio.
          </p>
        </div>
        <div className="self-start">
          <BotonExportarFlujoEfectivo data={data} perfil={empresa} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <FlujoEfectivoFiltros onBuscar={setFiltros} isFetching={isFetching} />
      </div>

      {filtros === null ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí un rango de fechas (o un período) y presioná{' '}
            <span className="font-medium">Consultar</span> para ver el Flujo de Efectivo.
          </p>
        </div>
      ) : (
        <FlujoEfectivoTabla data={data} isLoading={isLoading} isError={isError} />
      )}
    </div>
  );
}
