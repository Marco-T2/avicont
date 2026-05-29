import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PaginationBar } from '@/components/shared/pagination-bar';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { TipoDocumentoFisico } from '@/types/api';

import { DesactivarTipoDocumentoFisicoDialog } from '../components/desactivar-tipo-documento-fisico-dialog';
import { TipoDocumentoFisicoFormSheet } from '../components/tipo-documento-fisico-form-sheet';
import { TiposDocumentoFisicoListFilters } from '../components/tipos-documento-fisico-list-filters';
import { TiposDocumentoFisicoListTable } from '../components/tipos-documento-fisico-list-table';
import { useSetActivoTipoDocumentoFisico } from '../hooks/use-tipo-documento-fisico-mutations';
import { useTiposDocumentoFisico } from '../hooks/use-tipos-documento-fisico';
import {
  buildTiposDocumentoFisicoParams,
  PAGE_SIZE,
  type EstadoFiltro,
} from '../lib/build-tipos-documento-fisico-params';

export function TiposDocumentoFisicoPage(): React.JSX.Element {
  // Filtros — q se debouncea 350 ms antes de mandarse al backend (REQ-TDF-01.2).
  const [q, setQ] = useState('');
  const qDebounced = useDebouncedValue(q, 350);
  const [estado, setEstado] = useState<EstadoFiltro>('activos');
  const [page, setPage] = useState(1);

  // Sheet de creación/edición
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tipoEditando, setTipoEditando] = useState<TipoDocumentoFisico | null>(null);

  // Dialog de desactivación
  const [desactivarDialogOpen, setDesactivarDialogOpen] = useState(false);
  const [tipoDesactivando, setTipoDesactivando] = useState<TipoDocumentoFisico | null>(
    null,
  );

  // Resetea página cuando cambia cualquier filtro
  function updateQ(v: string): void {
    setQ(v);
    setPage(1);
  }
  function updateEstado(v: EstadoFiltro): void {
    setEstado(v);
    setPage(1);
  }

  const params = buildTiposDocumentoFisicoParams(estado, qDebounced, page);
  const { data, isLoading } = useTiposDocumentoFisico(params);

  const setActivoMutation = useSetActivoTipoDocumentoFisico();

  function handleNuevo(): void {
    setTipoEditando(null);
    setSheetOpen(true);
  }

  function handleEditar(tipo: TipoDocumentoFisico): void {
    setTipoEditando(tipo);
    setSheetOpen(true);
  }

  function handleDesactivar(tipo: TipoDocumentoFisico): void {
    setTipoDesactivando(tipo);
    setDesactivarDialogOpen(true);
  }

  function handleActivar(id: string): void {
    setActivoMutation.mutate({ id, activo: true });
  }

  function handleSheetOpenChange(open: boolean): void {
    setSheetOpen(open);
    if (!open) {
      // Limpiar el tipo editando cuando se cierra el sheet
      setTipoEditando(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            Tipos de documento físico
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Catálogo de tipos de documento tributario y no tributario del tenant.
          </p>
        </div>
        <Button onClick={handleNuevo} className="self-start">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo tipo
        </Button>
      </div>

      <div className="space-y-4">
        <TiposDocumentoFisicoListFilters
          q={q}
          onSearchChange={updateQ}
          estado={estado}
          onEstadoChange={updateEstado}
        />

        <TiposDocumentoFisicoListTable
          items={data?.items ?? []}
          isLoading={isLoading}
          onEditar={handleEditar}
          onDesactivar={handleDesactivar}
          onActivar={handleActivar}
          togglePendingId={
            setActivoMutation.isPending
              ? (setActivoMutation.variables?.id ?? null)
              : null
          }
        />

        {data !== undefined && (
          <PaginationBar
            page={data.page}
            limit={PAGE_SIZE}
            total={data.total}
            onPageChange={setPage}
          />
        )}
      </div>

      <TipoDocumentoFisicoFormSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        tipo={tipoEditando}
      />

      <DesactivarTipoDocumentoFisicoDialog
        tipo={tipoDesactivando}
        open={desactivarDialogOpen}
        onOpenChange={setDesactivarDialogOpen}
        onConfirm={() => setTipoDesactivando(null)}
      />
    </div>
  );
}
