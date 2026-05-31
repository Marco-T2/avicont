import { useState } from 'react';

import { BalanceGeneralFiltros } from '../components/balance-general-filtros';
import { BalanceGeneralTabla } from '../components/balance-general-tabla';
import { useBalanceGeneral } from '../hooks/use-balance-general';
import type { BalanceGeneralFiltroValues } from '../schemas/balance-general-filtro-schema';

// ============================================================
// Página del Balance General
// ============================================================

/**
 * Página del Balance General — Estado de Situación Financiera (REQ-BG-01..16).
 *
 * Orquesta filtros + tabla. El estado de los filtros vive acá (lifted state):
 * `BalanceGeneralFiltros` lo emite vía onBuscar, `BalanceGeneralTabla` lo consume.
 *
 * Patrón container/presentational (frontend CLAUDE.md §3) — Anti-F-11.
 */
export function BalanceGeneralPage(): React.JSX.Element {
  const [filtros, setFiltros] = useState<BalanceGeneralFiltroValues | null>(null);

  const { data, isLoading, isFetching, isError } = useBalanceGeneral(filtros);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Balance General</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Estado de Situación Financiera a una fecha de corte: Activo, Pasivo y Patrimonio.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <BalanceGeneralFiltros onBuscar={setFiltros} isFetching={isFetching} />
      </div>

      {filtros === null ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí una fecha de corte y presioná <span className="font-medium">Consultar</span>{' '}
            para ver el Balance General.
          </p>
        </div>
      ) : (
        <BalanceGeneralTabla data={data} isLoading={isLoading} isError={isError} />
      )}
    </div>
  );
}
