import { Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import type { EstadoComprobante, TipoComprobante } from '@/types/api';

import { useComprobantes } from '../hooks/use-comprobantes';

import { ComprobantesFilters } from './comprobantes-filters';
import { ComprobantesTable } from './comprobantes-table';
import { PaginationBar } from './pagination-bar';

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
  const incluirAnulados = searchParams.get('incluirAnulados') === 'true';

  const params = {
    page,
    limit: DEFAULT_LIMIT,
    ...(tipo !== null ? { tipo } : {}),
    ...(estado !== null ? { estado } : {}),
    ...(incluirAnulados ? { incluirAnulados } : {}),
  };

  const { data, isLoading, isError } = useComprobantes(params);

  function handlePageChange(nextPage: number): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(nextPage));
      return next;
    });
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comprobantes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Asientos contables del libro diario
          </p>
        </div>
        <Button onClick={() => void navigate('/comprobantes/nuevo')} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nuevo comprobante
        </Button>
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
