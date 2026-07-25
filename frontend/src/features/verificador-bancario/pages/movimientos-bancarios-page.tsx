import { useMemo, useState } from 'react';

import { PaginationBar } from '@/components/shared/pagination-bar';
import type { ListarMovimientosBancariosParams } from '@/types/api';

import { AuditoriaVinculosBanner } from '../components/auditoria-vinculos-banner';
import { MovimientosTabla } from '../components/movimientos-tabla';
import { SaldosPorCuenta } from '../components/saldos-por-cuenta';
import { VerificadorFiltros, type FiltrosVerificador } from '../components/verificador-filtros';
import { useMovimientosBancarios } from '../hooks/use-movimientos-bancarios';

const LIMIT = 50;

/**
 * Verificador de movimientos bancarios (REQ-VMB-01..11): mayor unificado
 * cross-cuenta, puerta de entrada al módulo de conciliación. Solo LEE.
 *
 * Presentación dual del saldo (REQ-VMB-10): con una cuenta seleccionada la
 * tabla muestra la columna `saldo` del banco (serie corrida real de ESA
 * cuenta); en cross-cuenta la columna se oculta y los saldos viven en la
 * franja por cuenta, con marca de desactualización contra el corte.
 */
export function MovimientosBancariosPage(): React.JSX.Element {
  const [filtros, setFiltros] = useState<FiltrosVerificador | null>(null);
  const [page, setPage] = useState(1);

  const params: ListarMovimientosBancariosParams | null =
    filtros === null ? null : { ...filtros, page, limit: LIMIT };

  const { data, isLoading, isError, isFetching } = useMovimientosBancarios(params);

  const aliasPorCuenta = useMemo(
    () =>
      Object.fromEntries((data?.saldos ?? []).map((s) => [s.cuentaBancariaId, s.alias])) as Record<
        string,
        string
      >,
    [data],
  );

  const hayFiltros = filtros !== null;
  const mostrarSaldo = filtros?.cuentaBancariaId !== undefined;

  // Con una sola moneda en el resultado, el código se rotula una vez en la
  // cabecera de la tabla en vez de repetirse en cada fila. `totales` viene por
  // moneda desde el backend, así que su largo ES la señal.
  const monedaUnica =
    data?.totales.length === 1 ? (data.totales[0]?.moneda ?? null) : null;

  return (
    <div className="space-y-6">
      {/* Header canónico (frontend/CLAUDE.md §13.1) */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Movimientos bancarios</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Mayor unificado de todos tus bancos: movimientos, estado de conciliación y saldos
          vigentes en un solo lugar.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <VerificadorFiltros
          onBuscar={(f) => {
            setPage(1);
            setFiltros(f);
          }}
          isFetching={isFetching}
        />
      </div>

      {!hayFiltros && (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí un período o rango de fechas y hacé clic en &ldquo;Consultar&rdquo;.
          </p>
        </div>
      )}

      {/* Anti-F-13: error de query inline, nunca con toast. */}
      {hayFiltros && isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudo cargar el listado. Revisá el rango elegido y volvé a consultar.
          </p>
        </div>
      )}

      {hayFiltros && !isError && data !== undefined && (
        <>
          <SaldosPorCuenta
            saldos={data.saldos}
            resumen={data.saldosPorMoneda}
            totales={data.totales}
            hasta={data.hasta}
          />

          <AuditoriaVinculosBanner
            auditoria={data.auditoriaVinculos}
            aliasPorCuenta={aliasPorCuenta}
          />

          {/* REQ-VMB-11: los subtotales POR MONEDA (sin conversión ni total
              combinado) ya no viven en una franja propia — comparten la fila de
              resumen de `SaldosPorCuenta` con el saldo de cada moneda. */}

          <section aria-label="Movimientos">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Movimientos
              </h2>
              <span className="text-sm text-muted-foreground tabular-nums">
                {data.total} en total
              </span>
            </div>
            <MovimientosTabla
              movimientos={data.movimientos}
              aliasPorCuenta={aliasPorCuenta}
              mostrarSaldo={mostrarSaldo}
              monedaUnica={monedaUnica}
              isLoading={isLoading}
            />
            <PaginationBar
              page={page}
              limit={LIMIT}
              total={data.total}
              onPageChange={setPage}
            />
          </section>
        </>
      )}
    </div>
  );
}
