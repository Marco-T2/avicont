import { Bird, Calendar, Home, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Can } from '@/components/shared/can';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PERMISSIONS } from '@/lib/permissions';

import { LoteForm } from '../components/lote-form';
import { useLotes } from '../hooks/use-granja-queries';
import { useCreateLote } from '../hooks/use-granja-mutations';
import { formatFechaGranja } from '../lib/formatters';
import type { EstadoLote, LoteListItem } from '../api/granja.types';
import type { LoteFormValues } from '../schemas/lote.schema';

type EstadoFiltro = EstadoLote | 'todos';

export function LotesPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('ACTIVO');
  const [createOpen, setCreateOpen] = useState(false);

  const estadoQuery: EstadoLote | undefined =
    estadoFiltro === 'todos' ? undefined : estadoFiltro;

  const { data, isLoading, isError } = useLotes(estadoQuery);
  const createLote = useCreateLote();

  function handleCreate(values: LoteFormValues): void {
    createLote.mutate(
      {
        cantidadInicial: values.cantidadInicial,
        fechaIngreso: values.fechaIngreso,
        ...(values.nombre !== undefined && values.nombre !== '' ? { nombre: values.nombre } : {}),
        ...(values.galpon !== undefined && values.galpon !== '' ? { galpon: values.galpon } : {}),
        ...(values.fechaEstimadaSaca !== undefined && values.fechaEstimadaSaca !== ''
          ? { fechaEstimadaSaca: values.fechaEstimadaSaca }
          : {}),
        ...(values.detalle !== undefined && values.detalle !== '' ? { detalle: values.detalle } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Lote creado correctamente');
          setCreateOpen(false);
        },
        onError: () => {
          toast.error('No se pudo crear el lote');
        },
      },
    );
  }

  function handleRowClick(lote: LoteListItem): void {
    void navigate(`/granja/lotes/${lote.id}`);
  }

  return (
    <div className="space-y-6">
      {/* Header canónico §13.1 CLAUDE.md */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Lotes</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Historial de lotes de producción avícola.
          </p>
        </div>
        <Can permission={PERMISSIONS.granja.lotes.create}>
          <Button onClick={() => setCreateOpen(true)} className="self-start min-h-[44px]">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo lote
          </Button>
        </Can>
      </div>

      {/* Filtros de estado */}
      <div className="flex gap-2 flex-wrap">
        {(['ACTIVO', 'CERRADO', 'todos'] as const).map((estado) => (
          <button
            key={estado}
            onClick={() => setEstadoFiltro(estado)}
            className={[
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors min-h-[36px]',
              estadoFiltro === estado
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            ].join(' ')}
          >
            {estado === 'ACTIVO' ? 'Activos' : estado === 'CERRADO' ? 'Cerrados' : 'Todos'}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudieron cargar los lotes. Intentá recargar.
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data === undefined || data.items.length === 0 ? (
        <EmptyState
          filtro={estadoFiltro}
          onNuevoLote={() => setCreateOpen(true)}
        />
      ) : (
        <div className="space-y-2">
          {data.items.map((lote) => (
            <LoteRow key={lote.id} lote={lote} onClick={handleRowClick} />
          ))}
        </div>
      )}

      {/* Dialog de crear lote — sheet fullscreen en mobile */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl max-w-none h-full sm:h-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo lote</DialogTitle>
          </DialogHeader>
          <div className="px-0 pb-4">
            <LoteForm
              mode="create"
              onSubmit={handleCreate}
              isSubmitting={createLote.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Subcomponentes internos ──────────────────────────────────────────────────

interface LoteRowProps {
  lote: LoteListItem;
  onClick: (lote: LoteListItem) => void;
}

function LoteRow({ lote, onClick }: LoteRowProps): React.JSX.Element {
  const estaActivo = lote.estado === 'ACTIVO';

  return (
    <button
      onClick={() => onClick(lote)}
      className="w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 min-h-[44px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium leading-tight truncate">
            {lote.nombre ?? `Lote ${lote.id.slice(0, 8)}`}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {lote.galpon !== null ? (
              <span className="flex items-center gap-1">
                <Home className="h-3 w-3" />
                {lote.galpon}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatFechaGranja(lote.fechaIngreso)}
            </span>
            <span className="flex items-center gap-1">
              <Bird className="h-3 w-3" />
              {lote.cantidadInicial.toLocaleString()} aves
            </span>
          </div>
        </div>
        <Badge variant={estaActivo ? 'default' : 'secondary'} className="shrink-0">
          {estaActivo ? 'Activo' : 'Cerrado'}
        </Badge>
      </div>
    </button>
  );
}

interface EmptyStateProps {
  filtro: EstadoFiltro;
  onNuevoLote: () => void;
}

function EmptyState({ filtro, onNuevoLote }: EmptyStateProps): React.JSX.Element {
  const esFiltroActivo = filtro !== 'todos';

  if (esFiltroActivo) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">No se encontraron lotes con ese filtro.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <Bird className="mx-auto h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">No hay lotes todavía</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Creá tu primer lote para empezar a registrar producción.
      </p>
      <Can permission={PERMISSIONS.granja.lotes.create}>
        <Button onClick={onNuevoLote} className="mt-4 min-h-[44px]">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo lote
        </Button>
      </Can>
    </div>
  );
}
