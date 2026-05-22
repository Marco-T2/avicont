import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { ContactoDetailDrawer } from '../components/contacto-detail-drawer';
import { ContactoFormSheet } from '../components/contacto-form-sheet';
import { ContactoListFilters } from '../components/contacto-list-filters';
import type { RolFiltro } from '../components/contacto-list-filters';
import { ContactoListTable } from '../components/contacto-list-table';
import { useContactos } from '../hooks/use-contactos';
import { buildContactosParams, PAGE_SIZE } from '../lib/build-contactos-params';

export function ContactosPage(): React.JSX.Element {
  // Filtros — search se debouncea antes de mandarse al backend.
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 150);
  const [rol, setRol] = useState<RolFiltro>('todos');
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Reset de página cuando cambia cualquier filtro — si estaba en p. 3 con 8
  // hits, tras buscar queda en la 1.
  function updateSearch(v: string): void {
    setSearch(v);
    setPage(1);
  }
  function updateRol(v: RolFiltro): void {
    setRol(v);
    setPage(1);
  }
  function updateIncluirInactivos(v: boolean): void {
    setIncluirInactivos(v);
    setPage(1);
  }

  const params = buildContactosParams(rol, incluirInactivos, debouncedSearch, page);
  const { data, isLoading } = useContactos(params);

  const totalPages =
    data !== undefined ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function handleSelect(id: string): void {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Contactos</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Directorio de clientes y proveedores del tenant.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="self-start">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo contacto
        </Button>
      </div>

      <div className="space-y-4">
        <ContactoListFilters
          rol={rol}
          onRolChange={updateRol}
          incluirInactivos={incluirInactivos}
          onIncluirInactivosChange={updateIncluirInactivos}
          search={search}
          onSearchChange={updateSearch}
        />

        <ContactoListTable
          contactos={data?.items ?? []}
          isLoading={isLoading}
          onSelect={(c) => handleSelect(c.id)}
        />

        {data !== undefined && data.total > PAGE_SIZE ? (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Página {data.page} de {totalPages} — {data.total} contactos en total
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage(data.page - 1)}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= totalPages}
                onClick={() => setPage(data.page + 1)}
                aria-label="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <ContactoDetailDrawer
        contactoId={selectedId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      <ContactoFormSheet
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
