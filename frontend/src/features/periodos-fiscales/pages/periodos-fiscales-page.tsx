import { CalendarRange, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { CerrarGestionButton } from '../components/cerrar-gestion-button';
import { GestionSelector } from '../components/gestion-selector';
import { NuevaGestionDialog } from '../components/nueva-gestion-dialog';
import { PeriodoDetailDrawer } from '../components/periodo-detail-drawer';
import { PeriodosTable } from '../components/periodos-table';
import { useGestiones } from '../hooks/use-gestiones';
import { useGestionDetalle } from '../hooks/use-gestion-detalle';

export function PeriodosFiscalesPage(): React.JSX.Element {
  const [selectedGestionId, setSelectedGestionId] = useState<string | null>(null);
  const [selectedPeriodoId, setSelectedPeriodoId] = useState<string | null>(null);
  const [nuevaGestionOpen, setNuevaGestionOpen] = useState(false);

  const gestionesQuery = useGestiones();

  // Si el user no eligió, default = gestión más reciente (year desc).
  const effectiveGestionId = useMemo(() => {
    if (selectedGestionId !== null) return selectedGestionId;
    const gs = gestionesQuery.data;
    if (gs === undefined || gs.length === 0) return null;
    return [...gs].sort((a, b) => b.year - a.year)[0]?.id ?? null;
  }, [selectedGestionId, gestionesQuery.data]);

  const detalleQuery = useGestionDetalle(effectiveGestionId ?? undefined);

  // tipoEmpresa para el texto educativo del dialog Nueva Gestión. Solo
  // disponible una vez que existe ≥1 gestión (viene en GestionConPeriodos).
  // Si no hay gestiones, queda null y el dialog usa fallback genérico.
  const tipoEmpresa = detalleQuery.data?.tipoEmpresaPrincipal ?? null;
  const periodos = detalleQuery.data?.periodos ?? [];

  if (gestionesQuery.isError) {
    toast.error('No se pudieron cargar las gestiones');
  }

  const isLoading = gestionesQuery.isLoading;
  const isEmpty =
    !isLoading && (gestionesQuery.data === undefined || gestionesQuery.data.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Períodos fiscales</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Gestiones anuales y períodos mensuales del tenant.
          </p>
        </div>
        <Button onClick={() => setNuevaGestionOpen(true)} className="self-start">
          <Plus className="h-4 w-4 mr-2" />
          Nueva gestión
        </Button>
      </div>

      {isLoading ? <PageSkeleton /> : null}

      {isEmpty ? (
        <EmptyState onCrear={() => setNuevaGestionOpen(true)} />
      ) : null}

      {!isLoading && !isEmpty ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <GestionSelector
              gestiones={gestionesQuery.data ?? []}
              value={effectiveGestionId}
              onChange={setSelectedGestionId}
            />
            <CerrarGestionButton gestionId={effectiveGestionId} />
          </div>

          {detalleQuery.isLoading ? (
            <PageSkeleton />
          ) : (
            <PeriodosTable
              periodos={periodos}
              onRowClick={(p) => setSelectedPeriodoId(p.id)}
            />
          )}
        </>
      ) : null}

      <NuevaGestionDialog
        open={nuevaGestionOpen}
        onOpenChange={setNuevaGestionOpen}
        tipoEmpresa={tipoEmpresa}
      />

      <PeriodoDetailDrawer
        periodoId={selectedPeriodoId}
        gestionId={effectiveGestionId}
        gestionStatus={detalleQuery.data?.status ?? 'ABIERTA'}
        onOpenChange={(open) => {
          if (!open) setSelectedPeriodoId(null);
        }}
      />
    </div>
  );
}

function PageSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function EmptyState({ onCrear }: { onCrear: () => void }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <CalendarRange className="mx-auto h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">No hay gestiones todavía</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Creá la primera gestión fiscal para empezar a registrar comprobantes.
      </p>
      <Button onClick={onCrear} className="mt-4">
        <Plus className="h-4 w-4 mr-2" />
        Crear primera gestión
      </Button>
    </div>
  );
}
