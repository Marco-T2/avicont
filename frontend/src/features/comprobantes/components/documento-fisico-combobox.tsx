import { ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { mensajeComprobantes } from '@/lib/error-messages';
import { mensajeDocumentosFisicos } from '@/lib/error-messages';
import { PERMISSIONS } from '@/lib/permissions';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { usePermissions } from '@/lib/use-permissions';
// Cross-feature: hook de búsqueda de documentos físicos existentes (feature B).
import { useDocumentosFisicos } from '@/features/documentos-fisicos/hooks/use-documentos-fisicos';
// Cross-feature: hook de creación de documentos físicos (feature B).
import { useCreateDocumentoFisico } from '@/features/documentos-fisicos/hooks/use-documento-fisico-mutations';
// Cross-feature: hook de tipos de documento para derivar tiposComprobanteAplicables (D4, D8).
import { useTiposDocumentoFisico } from '@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico';
// Cross-feature: tipo del payload de creación de la feature B.
import type { DocumentoFisicoFormValues } from '@/features/documentos-fisicos/schemas/documento-fisico-form-schema';
import type { TipoComprobante } from '@/types/api';

import { useAsociarDocumentos } from '../hooks/use-asociar-documentos';

import { DocumentoFisicoMiniForm } from './documento-fisico-mini-form';
import { DocumentoFisicoSearchView } from './documento-fisico-search-view';

interface DocumentoFisicoComboboxProps {
  comprobanteId: string;
  tipoComprobante: TipoComprobante;
  disabled?: boolean;
}

/**
 * Combobox "buscar o crear" para documentos físicos en el contexto de un comprobante.
 * D2: Búsqueda server-side; ítem fijo "Crear «{q}»" abre un mini-form inline dentro del Popover.
 * D4/D8: pre-filtro client-side de compatibilidad por tiposComprobanteAplicables.
 * D3: crear+asociar = 2 mutations encadenadas; si create OK pero asociar falla, toast explica doc suelto.
 *
 * Container puro: orquesta estado (open/view/search), datos y mutations; delega
 * la búsqueda a DocumentoFisicoSearchView y la creación inline a DocumentoFisicoMiniForm.
 */
export function DocumentoFisicoCombobox({
  comprobanteId,
  tipoComprobante,
  disabled = false,
}: DocumentoFisicoComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // 'search' | 'create-form' — vista alterna dentro del mismo Popover (D2)
  const [view, setView] = useState<'search' | 'create-form'>('search');

  const debouncedSearch = useDebouncedValue(search, 350);

  // Gating de permisos (afordancia honesta, espeja el backend):
  // - asociar/crear-y-asociar exigen AMBOS (AND) — comprobantes.controller.ts:175.
  // - crear el documento físico exige además su propio permiso de create.
  const { has, hasAll } = usePermissions();
  const puedeAsociar = hasAll([
    PERMISSIONS.contabilidad.documentosFisicos.update,
    PERMISSIONS.contabilidad.asientos.update,
  ]);
  const puedeCrear = has(PERMISSIONS.contabilidad.documentosFisicos.create);

  // Cross-feature: lista de tipos con sus tiposComprobanteAplicables para el pre-filtro (D8).
  const { data: tiposData } = useTiposDocumentoFisico({ pageSize: 100, activo: true });
  const tiposCompatibles = useMemo(() => {
    const all = tiposData?.items ?? [];
    return all.filter((t) => t.tiposComprobanteAplicables.includes(tipoComprobante));
  }, [tiposData, tipoComprobante]);
  const tiposCompatiblesIds = useMemo(
    () => new Set(tiposCompatibles.map((t) => t.id)),
    [tiposCompatibles],
  );

  // Cross-feature: búsqueda de documentos existentes.
  // disponibleParaAsociar=true excluye los consumidos por otro comprobante CONTABILIZADO;
  // los SUELTOS y los de borradores siguen apareciendo.
  const { data: docsData, isLoading: isLoadingDocs } = useDocumentosFisicos({
    numero: debouncedSearch.length > 0 ? debouncedSearch : undefined,
    pageSize: 20,
    disponibleParaAsociar: true,
  });

  // D4: pre-filtro client-side — solo mostrar docs cuyo tipo es compatible.
  const docsCompatibles = useMemo(() => {
    const all = docsData?.items ?? [];
    return all.filter((d) => tiposCompatiblesIds.has(d.tipoDocumentoFisico.id));
  }, [docsData, tiposCompatiblesIds]);

  const asociarMutation = useAsociarDocumentos(comprobanteId);
  const createMutation = useCreateDocumentoFisico();

  const isPending = createMutation.isPending || asociarMutation.isPending;

  function cerrarYVolverABusqueda(): void {
    setOpen(false);
    setSearch('');
    setView('search');
  }

  function handleSeleccionarExistente(docId: string): void {
    asociarMutation.mutate([docId], {
      onSuccess: () => {
        toast.success('Documento asociado correctamente');
        cerrarYVolverABusqueda();
      },
      onError: (err) => {
        toast.error(mensajeComprobantes(err));
      },
    });
  }

  function handleCrear(payload: DocumentoFisicoFormValues): void {
    // D3: crear primero, luego asociar.
    createMutation.mutate(payload, {
      onSuccess: (nuevoDoc) => {
        // Encadenar asociación.
        asociarMutation.mutate([nuevoDoc.id], {
          onSuccess: () => {
            toast.success('Documento creado y asociado correctamente');
            cerrarYVolverABusqueda();
          },
          onError: (errAsociar) => {
            // D3: doc quedó SUELTO — toast explica que es recuperable desde el CRUD standalone.
            toast.error(
              `El documento fue creado pero no se pudo asociar: ${mensajeComprobantes(errAsociar)}. Podés buscarlo en "Documentos físicos" y asociarlo manualmente.`,
            );
            cerrarYVolverABusqueda();
          },
        });
      },
      onError: (errCreate) => {
        toast.error(mensajeDocumentosFisicos(errCreate));
      },
    });
  }

  // Sin permiso para asociar → trigger deshabilitado con tooltip (no se abre el
  // popover). Mismo patrón disable+tooltip que los botones de acción (#87).
  if (!puedeAsociar) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex w-full">
            <Button
              type="button"
              variant="outline"
              disabled
              className="w-full justify-between font-normal text-muted-foreground"
            >
              <span className="truncate text-left">Buscar o crear documento…</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>No tenés permiso para asociar documentos</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setView('search');
          setSearch('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal text-muted-foreground"
        >
          <span className="truncate text-left">Buscar o crear documento…</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        {view === 'search' ? (
          <DocumentoFisicoSearchView
            search={search}
            onSearchChange={setSearch}
            isLoading={isLoadingDocs}
            docsCompatibles={docsCompatibles}
            isAsociando={asociarMutation.isPending}
            puedeCrear={puedeCrear}
            onSeleccionar={handleSeleccionarExistente}
            onCrearNuevo={() => setView('create-form')}
          />
        ) : (
          <DocumentoFisicoMiniForm
            tiposCompatibles={tiposCompatibles}
            numeroInicial={search}
            isPending={isPending}
            onCancelar={() => setView('search')}
            onCrear={handleCrear}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
