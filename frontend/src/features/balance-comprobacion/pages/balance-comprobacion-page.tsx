import { useState } from 'react';

// Cross-feature: perfil fiscal para la cabecera del export a Excel.
import { useEmpresa } from '@/features/tenants/hooks/use-empresa';

import { BalanceComprobacionFiltros } from '../components/balance-comprobacion-filtros';
import { BalanceComprobacionTabla } from '../components/balance-comprobacion-tabla';
import { BotonExportarBalanceComprobacion } from '../components/boton-exportar-balance-comprobacion';
import { useBalanceComprobacion } from '../hooks/use-balance-comprobacion';
import type { BalanceComprobacionFiltroValues } from '../schemas/balance-comprobacion-filtro-schema';

// ============================================================
// Página del Balance de Comprobación
// ============================================================

/**
 * Página del Balance de Comprobación de Sumas y Saldos (REQ-BC-01..13).
 *
 * Orquesta filtros + tabla (patrón container/presentational, frontend
 * CLAUDE.md §3 — Anti-F-11). El estado de los filtros vive acá (lifted state):
 * `BalanceComprobacionFiltros` lo emite vía onBuscar, la tabla lo consume.
 */
export function BalanceComprobacionPage(): React.JSX.Element {
  const [filtros, setFiltros] = useState<BalanceComprobacionFiltroValues | null>(null);

  const { data, isLoading, isFetching, isError } = useBalanceComprobacion(filtros);
  // Cross-feature: perfil fiscal para la cabecera del export a Excel.
  const { data: empresa } = useEmpresa();

  // Rango para el nombre del archivo: usa las fechas resueltas del response.
  const rango: string =
    data !== undefined ? `${data.fechaDesde}_${data.fechaHasta}` : 'sin-rango';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Balance de Comprobación</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Sumas y saldos de las cuentas con movimiento en un rango — control de la
            partida doble antes de emitir los estados financieros.
          </p>
        </div>
        <div className="self-start">
          <BotonExportarBalanceComprobacion data={data} perfil={empresa} rango={rango} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <BalanceComprobacionFiltros onBuscar={setFiltros} isFetching={isFetching} />
      </div>

      {filtros === null ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí un período o rango de fechas y presioná{' '}
            <span className="font-medium">Consultar</span> para ver el Balance de Comprobación.
          </p>
        </div>
      ) : (
        <BalanceComprobacionTabla data={data} isLoading={isLoading} isError={isError} />
      )}
    </div>
  );
}
