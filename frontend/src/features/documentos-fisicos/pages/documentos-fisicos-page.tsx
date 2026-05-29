import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PaginationBar } from '@/components/shared/pagination-bar';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/lib/use-debounced-value';
// Cross-feature: tipos de documento para el filtro de tipo.
import { useTiposDocumentoFisico } from '@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico';
import type { DocumentoFisico, EstadoAsociacion } from '@/types/api';

import { DocumentoFisicoDetalleDrawer } from '../components/documento-fisico-detalle-drawer';
import { DocumentoFisicoFormSheet } from '../components/documento-fisico-form-sheet';
import { DocumentoFisicoListFilters } from '../components/documento-fisico-list-filters';
import { DocumentoFisicoListTable } from '../components/documento-fisico-list-table';
import { EliminarDocumentoFisicoDialog } from '../components/eliminar-documento-fisico-dialog';
import { useDocumentosFisicos } from '../hooks/use-documentos-fisicos';
import {
  buildDocumentosFisicosParams,
  PAGE_SIZE,
} from '../lib/build-documentos-fisicos-params';

// TODO: ocultar botón si !hasPermission('contabilidad.documentos-fisicos.create')
// cuando esté disponible el hook useHasPermission en el proyecto.

export function DocumentosFisicosPage(): React.JSX.Element {
  // ─── Filtros ─────────────────────────────────────────────────────────────
  const [numero, setNumero] = useState('');
  const numeroDebouncedo = useDebouncedValue(numero, 350);

  const [tipoId, setTipoId] = useState<string | undefined>(undefined);
  const [estadoAsociacion, setEstadoAsociacion] = useState<EstadoAsociacion | undefined>(undefined);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [page, setPage] = useState(1);

  // Resetear página al cambiar cualquier filtro
  function updateNumero(v: string): void {
    setNumero(v);
    setPage(1);
  }
  function updateTipo(v: string | undefined): void {
    setTipoId(v);
    setPage(1);
  }
  function updateEstado(v: EstadoAsociacion | undefined): void {
    setEstadoAsociacion(v);
    setPage(1);
  }
  function updateFechaDesde(v: string): void {
    setFechaDesde(v);
    setPage(1);
  }
  function updateFechaHasta(v: string): void {
    setFechaHasta(v);
    setPage(1);
  }

  // ─── Query ───────────────────────────────────────────────────────────────
  const params = buildDocumentosFisicosParams(
    {
      numero: numeroDebouncedo,
      tipoDocumentoFisicoId: tipoId,
      estadoAsociacion,
      fechaDesde,
      fechaHasta,
    },
    page,
  );
  const { data, isLoading } = useDocumentosFisicos(params);

  // Cross-feature: tipos para el filtro.
  const { data: tiposData } = useTiposDocumentoFisico({ pageSize: 100, activo: true });
  const tipos = tiposData?.items ?? [];

  // ─── Sheet de creación/edición ────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [documentoEditando, setDocumentoEditando] = useState<DocumentoFisico | null>(null);

  // ─── Drawer de detalle ────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [documentoDetalle, setDocumentoDetalle] = useState<DocumentoFisico | null>(null);

  // ─── Dialog de eliminación ────────────────────────────────────────────────
  const [eliminarDialogOpen, setEliminarDialogOpen] = useState(false);
  const [documentoEliminando, setDocumentoEliminando] = useState<DocumentoFisico | null>(null);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  function handleNuevo(): void {
    setDocumentoEditando(null);
    setSheetOpen(true);
  }

  function handleEditar(doc: DocumentoFisico): void {
    setDocumentoEditando(doc);
    setDocumentoDetalle(doc);
    setSheetOpen(true);
    setDrawerOpen(false);
  }

  function handleVerDetalle(doc: DocumentoFisico): void {
    setDocumentoDetalle(doc);
    setDrawerOpen(true);
  }

  function handleEliminar(doc: DocumentoFisico): void {
    setDocumentoEliminando(doc);
    setEliminarDialogOpen(true);
    setDrawerOpen(false);
  }

  function handleSheetOpenChange(open: boolean): void {
    setSheetOpen(open);
    if (!open) setDocumentoEditando(null);
  }

  function handleDrawerOpenChange(open: boolean): void {
    setDrawerOpen(open);
    if (!open) setDocumentoDetalle(null);
  }

  function handleEliminarOpenChange(open: boolean): void {
    setEliminarDialogOpen(open);
    if (!open) setDocumentoEliminando(null);
  }

  // Abrir sheet de edición desde el drawer
  function handleEditarDesdeDrawer(): void {
    if (documentoDetalle !== null) {
      handleEditar(documentoDetalle);
    }
  }

  // Abrir dialog de eliminar desde el drawer
  function handleEliminarDesdeDrawer(): void {
    if (documentoDetalle !== null) {
      handleEliminar(documentoDetalle);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header canónico §13.1 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Documentos físicos</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Registros de documentos tributarios y no tributarios del tenant.
          </p>
        </div>
        <Button onClick={handleNuevo} className="self-start">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo documento
        </Button>
      </div>

      <div className="space-y-4">
        <DocumentoFisicoListFilters
          numero={numero}
          onNumeroChange={updateNumero}
          tipoId={tipoId}
          onTipoChange={updateTipo}
          estadoAsociacion={estadoAsociacion}
          onEstadoAsociacionChange={updateEstado}
          fechaDesde={fechaDesde}
          onFechaDesdeChange={updateFechaDesde}
          fechaHasta={fechaHasta}
          onFechaHastaChange={updateFechaHasta}
          tipos={tipos}
        />

        <DocumentoFisicoListTable
          items={data?.items ?? []}
          isLoading={isLoading}
          onVerDetalle={handleVerDetalle}
          onEditar={handleEditar}
          onEliminar={handleEliminar}
        />

        {/* §13.3: PaginationBar solo si hay datos */}
        {data !== undefined && (
          <PaginationBar
            page={data.page}
            limit={PAGE_SIZE}
            total={data.total}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Sheet de creación/edición */}
      <DocumentoFisicoFormSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        documento={documentoEditando}
      />

      {/* Drawer de detalle */}
      <DocumentoFisicoDetalleDrawer
        documentoId={documentoDetalle?.id ?? null}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        onEditar={handleEditarDesdeDrawer}
        onEliminar={handleEliminarDesdeDrawer}
      />

      {/* Dialog de eliminación */}
      <EliminarDocumentoFisicoDialog
        documento={documentoEliminando}
        open={eliminarDialogOpen}
        onOpenChange={handleEliminarOpenChange}
      />
    </div>
  );
}
