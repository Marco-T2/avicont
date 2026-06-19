import { useState } from 'react';

// Cross-feature: perfil fiscal para la cabecera del export a Excel.
import { useEmpresa } from '@/features/tenants/hooks/use-empresa';
import type { LibroMayorParams } from '@/types/api';

import { useLibroMayor } from '../hooks/use-libro-mayor';
import type { LibroMayorFiltroValues } from '../schemas/libro-mayor-filtro-schema';

import { BotonExportarLibroMayor } from '../components/boton-exportar-libro-mayor';
import { BotonExportarLibroMayorPdf } from '../components/boton-exportar-libro-mayor-pdf';
import { LibroMayorFiltros } from '../components/libro-mayor-filtros';
import { LibroMayorTabla } from '../components/libro-mayor-tabla';

/**
 * Página contenedora del Libro Mayor.
 *
 * Orquesta:
 * - LibroMayorFiltros: filtros (rango de fechas + toggles anulados / solo con movimiento + cuenta opcional)
 * - useLibroMayor: hook TanStack Query (solo se activa cuando hay rango válido)
 * - LibroMayorTabla: lista de cuentas expandibles con movimientos y saldo corriente
 *
 * Gating: esta página vive dentro del DashboardShell (autenticado). El gating
 * granular por permiso contabilidad.libro-mayor.read es deuda aceptada (GET
 * /me/permissions no implementado en el frontend aún) — mismo criterio que el
 * Libro Diario.
 */
export function LibroMayorPage(): React.JSX.Element {
  const [params, setParams] = useState<LibroMayorParams>({});

  const { data, isLoading, isError, isFetching } = useLibroMayor(params);
  // Cross-feature: perfil fiscal para la cabecera del export a Excel.
  const { data: empresa } = useEmpresa();

  function handleBuscar(values: LibroMayorFiltroValues): void {
    setParams({
      fechaDesde: values.fechaDesde,
      fechaHasta: values.fechaHasta,
      incluirAnulados: values.incluirAnulados,
      soloConMovimiento: values.soloConMovimiento,
      ...(values.cuentaId !== undefined ? { cuentaId: values.cuentaId } : {}),
    });
  }

  // tieneParams: truthy check sobre las fechas (string no vacío).
  // Evita el bug donde undefined !== undefined daba false pero string vacío pasaba.
  const tieneParams = Boolean(params.fechaDesde && params.fechaHasta);

  // Rango para el nombre del archivo de export.
  // Se deriva del response (data.rango) que trae las fechas RESUELTAS por el backend,
  // no de los params locales. Así, cuando el modo es período, se usan las fechas reales
  // del período en lugar del UUID del periodoFiscalId (bug R9).
  const rango: string =
    data !== undefined
      ? `${data.rango.fechaDesde}_${data.rango.fechaHasta}`
      : 'sin-rango';

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
        <div className="flex gap-2 self-start">
          <BotonExportarLibroMayor data={data} perfil={empresa} rango={rango} />
          <BotonExportarLibroMayorPdf data={data} perfil={empresa} rango={rango} />
        </div>
      </div>

      {/* Filtros — R7: card wrapper igual que los reportes EEFF */}
      <div className="rounded-lg border bg-card p-4">
        <LibroMayorFiltros onBuscar={handleBuscar} isFetching={isFetching} />
      </div>

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
