import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { type ClaseCuenta } from '@/types/api';

import { CuentaDetailDrawer } from '../components/cuenta-detail-drawer';
import { CuentaFormSheet } from '../components/cuenta-form-sheet';
import { CuentaListFilters } from '../components/cuenta-list-filters';
import { CuentaListTable } from '../components/cuenta-list-table';
import { CuentaTreeView } from '../components/cuenta-tree-view';
import { useCuentas } from '../hooks/use-cuentas';
import { useCuentaTree } from '../hooks/use-cuenta-tree';

const PAGE_SIZE = 25;

type ViewMode = 'lista' | 'arbol';

function parseView(raw: string | null): ViewMode {
  return raw === 'arbol' ? 'arbol' : 'lista';
}

export function PlanCuentasPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get('view'));
  const setView = (v: ViewMode): void => {
    setSearchParams({ view: v }, { replace: true });
  };

  // Filtros — el search se debouncea antes de mandarse al backend.
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 150);
  const [clase, setClase] = useState<ClaseCuenta | null>(null);
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Reset de página cuando cambia un filtro — si estaba en p. 3 con 8 hits,
  // tras buscar queda en la 1.
  function updateSearch(v: string): void {
    setSearch(v);
    setPage(1);
  }
  function updateClase(v: ClaseCuenta | null): void {
    setClase(v);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Plan de cuentas</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Catálogo contable del tenant — jerárquico según PUCT.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="self-start">
          <Plus className="h-4 w-4 mr-2" />
          Nueva cuenta
        </Button>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(parseView(v))}>
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="arbol">Árbol</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4 mt-4">
          <ListaTab
            search={search}
            debouncedSearch={debouncedSearch}
            onSearchChange={updateSearch}
            clase={clase}
            onClaseChange={updateClase}
            page={page}
            onPageChange={setPage}
            onSelect={(id) => setSelectedId(id)}
          />
        </TabsContent>

        <TabsContent value="arbol" className="space-y-4 mt-4">
          <ArbolTab onSelect={(id) => setSelectedId(id)} />
        </TabsContent>
      </Tabs>

      <CuentaDetailDrawer
        cuentaId={selectedId}
        onClose={() => setSelectedId(null)}
      />

      <CuentaFormSheet
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

// ------------------------------------------------------------
// Lista tab
// ------------------------------------------------------------

interface ListaTabProps {
  search: string;
  debouncedSearch: string;
  onSearchChange: (v: string) => void;
  clase: ClaseCuenta | null;
  onClaseChange: (v: ClaseCuenta | null) => void;
  page: number;
  onPageChange: (p: number) => void;
  onSelect: (id: string) => void;
}

function ListaTab(props: ListaTabProps): React.JSX.Element {
  const query = useCuentas({
    page: props.page,
    pageSize: PAGE_SIZE,
    ...(props.clase !== null ? { claseCuenta: props.clase } : {}),
    ...(props.debouncedSearch.length > 0 ? { search: props.debouncedSearch } : {}),
  });

  if (query.isError) {
    toast.error('No se pudieron cargar las cuentas');
  }

  const data = query.data;
  const totalPages = data !== undefined ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <CuentaListFilters
        search={props.search}
        onSearchChange={props.onSearchChange}
        clase={props.clase}
        onClaseChange={props.onClaseChange}
      />

      <CuentaListTable
        cuentas={data?.items ?? []}
        loading={query.isLoading}
        onSelect={(c) => props.onSelect(c.id)}
      />

      {data !== undefined && data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {data.page} de {totalPages} — {data.total} cuentas en total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => props.onPageChange(data.page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= totalPages}
              onClick={() => props.onPageChange(data.page + 1)}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------
// Árbol tab
// ------------------------------------------------------------

function ArbolTab({
  onSelect,
}: {
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const { data, isLoading, isError } = useCuentaTree();

  if (isError) {
    toast.error('No se pudo cargar el árbol de cuentas');
  }

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        Cargando árbol…
      </div>
    );
  }

  return (
    <CuentaTreeView
      nodes={data ?? []}
      onSelect={(node) => onSelect(node.id)}
    />
  );
}
