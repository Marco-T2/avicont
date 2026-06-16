import { useState } from 'react';

// Cross-feature: perfil fiscal para la cabecera del export a Excel.
import { useEmpresa } from '@/features/tenants/hooks/use-empresa';
import type { LibroDiarioParams } from '@/types/api';

import { useLibroDiario } from '../hooks/use-libro-diario';
import type { LibroDiarioFiltroValues } from '../schemas/libro-diario-filtro-schema';

import { BotonExportarLibroDiario } from '../components/boton-exportar-libro-diario';
import { LibroDiarioFiltros } from '../components/libro-diario-filtros';
import { LibroDiarioTabla } from '../components/libro-diario-tabla';

/**
 * Página contenedora del Libro Diario.
 *
 * Orquesta:
 * - LibroDiarioFiltros: formulario de filtros (período O rango + toggle anulados)
 * - useLibroDiario: hook TanStack Query (solo se activa cuando hay filtros válidos)
 * - LibroDiarioTabla: tabla agrupada por asiento con totales al pie
 *
 * REQ-LD-11: pantalla del Libro Diario con selector de filtro, tabla agrupada,
 * totales al pie y estados loading/vacío/error.
 *
 * Gating: esta página solo es accesible a usuarios con el módulo contabilidad
 * activo — el routing la ubica dentro del DashboardShell (autenticado).
 * Gating granular por permiso contabilidad.libro-diario.read es deuda aceptada
 * (GET /me/permissions no implementado en el frontend aún).
 */
export function LibroDiarioPage(): React.JSX.Element {
  const [params, setParams] = useState<LibroDiarioParams>({});

  const { data, isLoading, isError, isFetching } = useLibroDiario(params);
  // Cross-feature: perfil fiscal para la cabecera del export a Excel.
  const { data: empresa } = useEmpresa();

  function handleBuscar(values: LibroDiarioFiltroValues): void {
    if (values.modo === 'periodo') {
      setParams({
        periodoFiscalId: values.periodoFiscalId,
        incluirAnulados: values.incluirAnulados,
        ...(values.cuentaId !== undefined ? { cuentaId: values.cuentaId } : {}),
      });
    } else {
      setParams({
        fechaDesde: values.fechaDesde,
        fechaHasta: values.fechaHasta,
        incluirAnulados: values.incluirAnulados,
        ...(values.cuentaId !== undefined ? { cuentaId: values.cuentaId } : {}),
      });
    }
  }

  const tieneParams =
    params.periodoFiscalId !== undefined ||
    (params.fechaDesde !== undefined && params.fechaHasta !== undefined);

  // Rango para el nombre del archivo de export.
  const rango: string =
    params.fechaDesde !== undefined && params.fechaHasta !== undefined
      ? `${params.fechaDesde}_${params.fechaHasta}`
      : (params.periodoFiscalId ?? 'sin-rango');

  return (
    <div className="space-y-6">
      {/* Header canónico (CLAUDE.md frontend §13.1) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Libro Diario</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Asientos contabilizados y bloqueados en orden cronológico
          </p>
        </div>
        <div className="self-start">
          <BotonExportarLibroDiario data={data} perfil={empresa} rango={rango} />
        </div>
      </div>

      {/* Filtros — R7: card wrapper igual que los reportes EEFF */}
      <div className="rounded-lg border bg-card p-4">
        <LibroDiarioFiltros onBuscar={handleBuscar} isFetching={isFetching} />
      </div>

      {/* Tabla — solo se muestra si hay params activos */}
      {tieneParams && (
        <LibroDiarioTabla
          asientos={data?.asientos}
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
