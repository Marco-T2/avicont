import { Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { EstadoComprobante, TipoComprobante } from '@/types/api';

import { PaginationBar } from '@/components/shared/pagination-bar';
import { PermissionButton } from '@/components/shared/permission-button';
import { useEmpresa } from '@/features/tenants/hooks/use-empresa';
import { PERMISSIONS } from '@/lib/permissions';

import { useComprobantes } from '../hooks/use-comprobantes';

import { BotonExportarComprobantes } from './boton-exportar-comprobantes';
import { ComprobantesFilters } from './comprobantes-filters';
import { ComprobantesTable } from './comprobantes-table';

const DEFAULT_LIMIT = 20;

/**
 * Página contenedora de la lista de comprobantes.
 * Orquesta:
 * - URL state (useSearchParams) para filtros y paginación.
 * - useComprobantes para el fetch paginado con keepPreviousData.
 * - ComprobantesFilters → ComprobantesTable → PaginationBar.
 * - Botón "Nuevo comprobante" → navega a /comprobantes/nuevo (EditarComprobantePage).
 */
export function ComprobantesPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const tipo = searchParams.get('tipo') as TipoComprobante | null;
  const estado = searchParams.get('estado') as EstadoComprobante | null;
  const periodoFiscalId = searchParams.get('periodoFiscalId');
  const q = searchParams.get('q');
  const incluirAnulados = searchParams.get('incluirAnulados') === 'true';

  const params = {
    page,
    limit: DEFAULT_LIMIT,
    ...(tipo !== null ? { tipo } : {}),
    ...(estado !== null ? { estado } : {}),
    ...(periodoFiscalId !== null ? { periodoFiscalId } : {}),
    ...(q !== null && q !== '' ? { q } : {}),
    ...(incluirAnulados ? { incluirAnulados } : {}),
  };

  const { data, isLoading, isError } = useComprobantes(params);
  const { data: empresa } = useEmpresa();

  // Filtros de export: iguales que params sin page/limit
  const filtrosExport = {
    ...(tipo !== null ? { tipo } : {}),
    ...(estado !== null ? { estado } : {}),
    ...(periodoFiscalId !== null ? { periodoFiscalId } : {}),
    ...(q !== null && q !== '' ? { q } : {}),
    ...(incluirAnulados ? { incluirAnulados } : {}),
  };

  // Rango para el nombre del archivo: período si hay filtro activo, o "todos"
  const rangoArchivo = periodoFiscalId ?? 'todos';

  function handlePageChange(nextPage: number): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(nextPage));
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Comprobantes</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Asientos contables del libro diario
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <BotonExportarComprobantes
            filtros={filtrosExport}
            perfil={empresa ?? null}
            rango={rangoArchivo}
          />
          <PermissionButton
            permission={PERMISSIONS.contabilidad.asientos.create}
            deniedReason="No tenés permiso para crear asientos"
            onClick={() => void navigate('/comprobantes/nuevo')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo comprobante
          </PermissionButton>
        </div>
      </div>

      {/* Filtros */}
      <ComprobantesFilters />

      {/* Tabla */}
      <ComprobantesTable
        comprobantes={data?.items}
        isLoading={isLoading}
        isError={isError}
      />

      {/* Paginación */}
      {data !== undefined && (
        <PaginationBar
          page={page}
          limit={DEFAULT_LIMIT}
          total={data.total}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
