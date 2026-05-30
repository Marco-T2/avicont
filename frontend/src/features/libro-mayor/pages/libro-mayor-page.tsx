import { useState } from 'react';

import type { LibroMayorParams } from '@/types/api';

import { useLibroMayor } from '../hooks/use-libro-mayor';
import type { LibroMayorFiltroValues } from '../schemas/libro-mayor-filtro-schema';

import { LibroMayorFiltros } from '../components/libro-mayor-filtros';
import { LibroMayorTabla } from '../components/libro-mayor-tabla';

/**
 * Página contenedora del Libro Mayor.
 *
 * Orquesta:
 * - LibroMayorFiltros: filtros (período O rango + toggles anulados / solo con movimiento)
 * - useLibroMayor: hook TanStack Query (solo se activa cuando hay rango válido)
 * - LibroMayorTabla: lista de cuentas expandibles con movimientos y saldo corriente
 *
 * Gating: esta página vive dentro del DashboardShell (autenticado). El gating
 * granular por permiso contabilidad.libro-mayor.read es deuda aceptada (GET
 * /me/permissions no implementado en el frontend aún) — mismo criterio que el
 * Libro Diario.
 *
 * Deuda: filtro por cuenta única (cuentaId, soportado por el backend) diferido
 * a un follow-up — requiere un autocomplete de cuentas (las cuentas de detalle
 * pueden ser 100+). El toggle "solo con movimiento" ya acota la lista.
 */
export function LibroMayorPage(): React.JSX.Element {
  const [params, setParams] = useState<LibroMayorParams>({});

  const { data, isLoading, isError, isFetching } = useLibroMayor(params);

  function handleBuscar(values: LibroMayorFiltroValues): void {
    if (values.modo === 'periodo') {
      setParams({
        periodoFiscalId: values.periodoFiscalId,
        incluirAnulados: values.incluirAnulados,
        soloConMovimiento: values.soloConMovimiento,
      });
    } else {
      setParams({
        fechaDesde: values.fechaDesde,
        fechaHasta: values.fechaHasta,
        incluirAnulados: values.incluirAnulados,
        soloConMovimiento: values.soloConMovimiento,
      });
    }
  }

  const tieneParams =
    params.periodoFiscalId !== undefined ||
    (params.fechaDesde !== undefined && params.fechaHasta !== undefined);

  return (
    <div className="space-y-6">
      {/* Header canónico (CLAUDE.md frontend §13.1) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Libro Mayor</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Movimientos por cuenta con saldo inicial, corriente y final
          </p>
        </div>
      </div>

      {/* Filtros */}
      <LibroMayorFiltros onBuscar={handleBuscar} isFetching={isFetching} />

      {/* Tabla — solo se muestra si hay params activos */}
      {tieneParams && (
        <LibroMayorTabla
          cuentas={data?.cuentas}
          totalDebeBob={data?.totalDebeBob ?? '0.00'}
          totalHaberBob={data?.totalHaberBob ?? '0.00'}
          isLoading={isLoading}
          isError={isError}
        />
      )}

      {/* Estado inicial: sin búsqueda activa */}
      {!tieneParams && (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Seleccioná un período o rango de fechas y hacé clic en "Consultar".
          </p>
        </div>
      )}
    </div>
  );
}
