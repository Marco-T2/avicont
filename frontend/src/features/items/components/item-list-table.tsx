import { Package, Plus } from 'lucide-react';

import { PermissionButton } from '@/components/shared/permission-button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { Item, TipoItem } from '@/types/api';

import { TIPO_ITEM_OPTIONS } from '../lib/build-items-params';
import { formatearDecimalDisplay } from '../lib/formatear-decimal';

const TIPO_LABEL: Record<TipoItem, string> = Object.fromEntries(
  TIPO_ITEM_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<TipoItem, string>;

interface ItemListTableProps {
  items: Item[];
  isLoading: boolean;
  // Distingue los dos empty states de §13.4: con filtros activos no hay CTA.
  hayFiltros: boolean;
  onCrear: () => void;
  onEditar: (item: Item) => void;
  onDesactivar: (item: Item) => void;
  onReactivar: (id: string) => void;
  // Id del ítem cuya reactivación está en curso; deshabilita ese botón (Anti-F-07).
  reactivarPendingId: string | null;
}

// Tabla con scroll horizontal en mobile (frontend/CLAUDE.md §7): min-w fija y
// contenedor overflow-x-auto. La columna Nombre es la ancla de lectura.
export function ItemListTable({
  items,
  isLoading,
  hayFiltros,
  onCrear,
  onEditar,
  onDesactivar,
  onReactivar,
  reactivarPendingId,
}: ItemListTableProps): React.JSX.Element {
  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!isLoading && items.length === 0) {
    if (hayFiltros) {
      return (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">No se encontraron resultados.</p>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
        <Package className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">No hay ítems todavía</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargá los productos y servicios que vendés para usarlos en las ventas.
        </p>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.items.create}
          deniedReason="No tenés permiso para crear ítems"
          onClick={onCrear}
          className="mt-4"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo ítem
        </PermissionButton>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead className="min-w-[200px]">Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead className="text-right">Precio sugerido</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                {item.codigo !== null ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {item.codigo}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-medium">{item.nombre}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {TIPO_LABEL[item.tipo]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {item.unidadMedida ?? '—'}
              </TableCell>
              {/* §4.5: el precio es un string decimal; el formateo agrupa miles
                  y no toca la precisión — sin Number(), sin recalcular. */}
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {item.precioUnitarioSugerido !== null
                  ? formatearDecimalDisplay(item.precioUnitarioSugerido)
                  : '—'}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs',
                    item.activo ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      item.activo ? 'bg-green-500' : 'bg-muted-foreground/40',
                    )}
                    aria-hidden="true"
                  />
                  {item.activo ? 'Activo' : 'Inactivo'}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <PermissionButton
                    permission={PERMISSIONS.contabilidad.items.update}
                    deniedReason="No tenés permiso para modificar ítems"
                    variant="outline"
                    size="sm"
                    onClick={() => onEditar(item)}
                  >
                    Editar
                  </PermissionButton>
                  {item.activo ? (
                    // Desactivar es REVERSIBLE (existe /reactivar): outline con
                    // texto destructivo, no variant="destructive" (§14.4).
                    <PermissionButton
                      permission={PERMISSIONS.contabilidad.items.delete}
                      deniedReason="No tenés permiso para desactivar ítems"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDesactivar(item)}
                    >
                      Desactivar
                    </PermissionButton>
                  ) : (
                    <PermissionButton
                      permission={PERMISSIONS.contabilidad.items.update}
                      deniedReason="No tenés permiso para reactivar ítems"
                      variant="outline"
                      size="sm"
                      disabled={reactivarPendingId === item.id}
                      onClick={() => onReactivar(item.id)}
                    >
                      Reactivar
                    </PermissionButton>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
