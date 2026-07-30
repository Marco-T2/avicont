import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PaginationBar } from '@/components/shared/pagination-bar';
import { PermissionButton } from '@/components/shared/permission-button';
import { PERMISSIONS } from '@/lib/permissions';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { Item } from '@/types/api';

import { DesactivarItemDialog } from '../components/desactivar-item-dialog';
import { ItemFormSheet } from '../components/item-form-sheet';
import { ItemListFilters } from '../components/item-list-filters';
import { ItemListTable } from '../components/item-list-table';
import { useReactivarItem } from '../hooks/use-item-mutations';
import { useItems } from '../hooks/use-items';
import {
  buildItemsParams,
  PAGE_SIZE,
  type EstadoFiltro,
  type TipoFiltro,
} from '../lib/build-items-params';

export function ItemsPage(): React.JSX.Element {
  // Filtros — q se debouncea antes de mandarse al backend.
  const [q, setQ] = useState('');
  const qDebounced = useDebouncedValue(q, 350);
  const [tipo, setTipo] = useState<TipoFiltro>('todos');
  const [estado, setEstado] = useState<EstadoFiltro>('activos');
  const [page, setPage] = useState(1);

  // Sheet de creación/edición
  const [sheetOpen, setSheetOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState<Item | null>(null);

  // Dialog de desactivación
  const [desactivarDialogOpen, setDesactivarDialogOpen] = useState(false);
  const [itemDesactivando, setItemDesactivando] = useState<Item | null>(null);

  // Reset de página cuando cambia cualquier filtro.
  function updateQ(v: string): void {
    setQ(v);
    setPage(1);
  }
  function updateTipo(v: TipoFiltro): void {
    setTipo(v);
    setPage(1);
  }
  function updateEstado(v: EstadoFiltro): void {
    setEstado(v);
    setPage(1);
  }

  const params = buildItemsParams(tipo, estado, qDebounced, page);
  const { data, isLoading } = useItems(params);

  const reactivarMutation = useReactivarItem();

  const hayFiltros = q !== '' || tipo !== 'todos' || estado !== 'activos';

  function handleNuevo(): void {
    setItemEditando(null);
    setSheetOpen(true);
  }

  function handleEditar(item: Item): void {
    setItemEditando(item);
    setSheetOpen(true);
  }

  function handleDesactivar(item: Item): void {
    setItemDesactivando(item);
    setDesactivarDialogOpen(true);
  }

  function handleReactivar(id: string): void {
    reactivarMutation.mutate(id);
  }

  function handleSheetOpenChange(open: boolean): void {
    setSheetOpen(open);
    if (!open) {
      setItemEditando(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Ítems</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Catálogo de productos y servicios para la venta.
          </p>
        </div>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.items.create}
          deniedReason="No tenés permiso para crear ítems"
          onClick={handleNuevo}
          className="self-start"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo ítem
        </PermissionButton>
      </div>

      <div className="space-y-4">
        <ItemListFilters
          q={q}
          onSearchChange={updateQ}
          tipo={tipo}
          onTipoChange={updateTipo}
          estado={estado}
          onEstadoChange={updateEstado}
        />

        <ItemListTable
          items={data?.items ?? []}
          isLoading={isLoading}
          hayFiltros={hayFiltros}
          onCrear={handleNuevo}
          onEditar={handleEditar}
          onDesactivar={handleDesactivar}
          onReactivar={handleReactivar}
          reactivarPendingId={
            reactivarMutation.isPending ? (reactivarMutation.variables ?? null) : null
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

      <ItemFormSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        item={itemEditando}
      />

      <DesactivarItemDialog
        item={itemDesactivando}
        open={desactivarDialogOpen}
        onOpenChange={setDesactivarDialogOpen}
      />
    </div>
  );
}
