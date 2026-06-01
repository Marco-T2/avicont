import { Bird } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';

import { LoteCard } from '../components/lote-card';
import { useDashboard } from '../hooks/use-granja-queries';
import { useCerrarLote } from '../hooks/use-granja-mutations';

/**
 * Dashboard del módulo granja — lista lotes ACTIVOS con métricas.
 * La ruta ya está protegida con RequirePermission(granja.dashboard.read),
 * así que acá solo manejamos loading / empty / data.
 */
export function GranjaDashboardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useDashboard();
  const cerrarLote = useCerrarLote();

  // Cerrar un lote es IRREVERSIBLE (v1 no reabre); confirmamos antes de mutar
  // para que un toque accidental no cierre la crianza.
  const [cerrarTargetId, setCerrarTargetId] = useState<string | null>(null);
  const loteACerrar = data?.find((l) => l.id === cerrarTargetId);

  function handleRegistrarMovimiento(loteId: string): void {
    void navigate(`/granja/lotes/${loteId}`);
  }

  function handleCerrar(loteId: string): void {
    setCerrarTargetId(loteId);
  }

  function handleCerrarConfirm(e: React.MouseEvent): void {
    e.preventDefault();
    if (cerrarTargetId === null) return;
    cerrarLote.mutate(cerrarTargetId, {
      onSuccess: () => {
        toast.success('Lote cerrado correctamente');
        setCerrarTargetId(null);
      },
      onError: () => toast.error('No se pudo cerrar el lote'),
    });
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudo cargar el dashboard. Intentá recargar la página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {isLoading ? (
        <LoadingSkeleton />
      ) : data === undefined || data.length === 0 ? (
        <EmptyState onVerLotes={() => { void navigate('/granja/lotes'); }} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((lote) => (
            <LoteCard
              key={lote.id}
              lote={lote}
              onRegistrarMovimiento={handleRegistrarMovimiento}
              onCerrar={handleCerrar}
            />
          ))}
        </div>
      )}

      {/* Confirmación de cierre — acción irreversible */}
      <AlertDialog
        open={cerrarTargetId !== null}
        onOpenChange={(open) => { if (!open) setCerrarTargetId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cerrar {loteACerrar?.nombre ?? 'este lote'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El lote quedará cerrado. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCerrarConfirm} disabled={cerrarLote.isPending}>
              {cerrarLote.isPending ? 'Cerrando…' : 'Cerrar lote'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Subcomponentes internos ──────────────────────────────────────────────────

function PageHeader(): React.JSX.Element {
  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
      <p className="text-sm md:text-base text-muted-foreground">
        Resumen de lotes activos con métricas de producción.
      </p>
    </div>
  );
}

function LoadingSkeleton(): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-lg border p-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  onVerLotes: () => void;
}

function EmptyState({ onVerLotes }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <Bird className="mx-auto h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">No hay lotes activos</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Creá un lote para empezar a registrar tu producción.
      </p>
      <button
        onClick={onVerLotes}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-[44px] transition-colors hover:bg-primary/90"
      >
        Ver lotes
      </button>
    </div>
  );
}
