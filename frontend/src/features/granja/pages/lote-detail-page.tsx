import { AlertTriangle, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Can } from '@/components/shared/can';
import { PermissionButton } from '@/components/shared/permission-button';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PERMISSIONS } from '@/lib/permissions';

import type { MovimientoCantidadResponse, MovimientoInversionResponse } from '../api/granja.types';
import { MovimientoCantidadForm } from '../components/movimiento-cantidad-form';
import { MovimientoInversionForm } from '../components/movimiento-inversion-form';
import { useLote, useMovimientos, useTiposRegistro } from '../hooks/use-granja-queries';
import {
  useCerrarLote,
  useCreateMovimientoCantidad,
  useCreateMovimientoInversion,
  useDeleteMovimiento,
} from '../hooks/use-granja-mutations';
import {
  formatCostoPorPollo,
  formatFechaGranja,
  formatPorcentajeMortalidad,
} from '../lib/formatters';
import type { MovimientoCantidadFormValues } from '../schemas/movimiento-cantidad.schema';
import type { MovimientoInversionFormValues } from '../schemas/movimiento-inversion.schema';

/**
 * Página de detalle de un lote.
 * - Resumen (aves vivas, costo/pollo, mortalidad, edad)
 * - Desglose de costos por tipo — computado CLIENT-SIDE (openspec frontend-contracts.md §Derivados)
 * - Tabs de inversiones y cantidades con formularios inline
 * - Botón "Cerrar lote" con AlertDialog de confirmación
 */
export function LoteDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: lote, isLoading: loadingLote, isError: errorLote } = useLote(id);
  const { data: movimientos, isLoading: loadingMovimientos } = useMovimientos(id);
  // Cross-feature: todos los tipos (sin filtro) para el desglose y para los forms.
  const { data: tiposRegistro } = useTiposRegistro();

  const cerrarLote = useCerrarLote();
  const createInversion = useCreateMovimientoInversion(id);
  const createCantidad = useCreateMovimientoCantidad(id);
  const deleteMovimiento = useDeleteMovimiento(id);

  const [cerrarDialogOpen, setCerrarDialogOpen] = useState(false);
  const [addInversionOpen, setAddInversionOpen] = useState(false);
  const [addCantidadOpen, setAddCantidadOpen] = useState(false);
  // Borrar un movimiento confirma antes de mutar — un toque al tachito no debe
  // borrar un gasto/baja por accidente.
  const [deleteTarget, setDeleteTarget] = useState<
    { tipo: 'inversion' | 'cantidad'; movId: string } | null
  >(null);

  // ─── Desglose de costos por tipo (CLIENT-SIDE) ────────────────────────────
  // Agrupar inversiones por tipoRegistroId, sumar monto (string math via Number),
  // joinear nombre desde tiposRegistro.
  // Nota: usamos Number() para la suma porque la imprecisión IEEE-754 en BOB con
  // 2 decimales es aceptable para display; no es cálculo contable crítico.
  const desgloseCostos = useMemo(() => {
    if (movimientos === undefined || tiposRegistro === undefined) return [];

    const acumulado = new Map<string, number>();
    for (const inv of movimientos.inversiones) {
      const actual = acumulado.get(inv.tipoRegistroId) ?? 0;
      acumulado.set(inv.tipoRegistroId, actual + Number(inv.monto));
    }

    return Array.from(acumulado.entries())
      .map(([tipoId, total]) => {
        const tipo = tiposRegistro.find((t) => t.id === tipoId);
        return {
          tipoId,
          nombre: tipo?.nombre ?? 'Tipo desconocido',
          total: total.toFixed(2),
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));
  }, [movimientos, tiposRegistro]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  function handleCerrarConfirm(e: React.MouseEvent): void {
    e.preventDefault();
    if (!id) return;
    cerrarLote.mutate(id, {
      onSuccess: () => {
        toast.success('Lote cerrado correctamente');
        setCerrarDialogOpen(false);
      },
      onError: () => {
        toast.error('No se pudo cerrar el lote');
      },
    });
  }

  function handleAddInversion(values: MovimientoInversionFormValues): void {
    createInversion.mutate(values, {
      onSuccess: () => {
        toast.success('Inversión registrada');
        setAddInversionOpen(false);
      },
      onError: () => toast.error('No se pudo registrar la inversión'),
    });
  }

  function handleAddCantidad(values: MovimientoCantidadFormValues): void {
    createCantidad.mutate(
      {
        cantidad: values.cantidad,
        fecha: values.fecha,
        tipoRegistroId: values.tipoRegistroId,
        ...(values.detalle !== undefined && values.detalle !== '' ? { detalle: values.detalle } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Movimiento registrado');
          setAddCantidadOpen(false);
        },
        onError: () => toast.error('No se pudo registrar el movimiento'),
      },
    );
  }

  function handleDeleteConfirm(e: React.MouseEvent): void {
    e.preventDefault();
    if (deleteTarget === null) return;
    deleteMovimiento.mutate(deleteTarget, {
      onSuccess: () => {
        toast.success('Movimiento eliminado');
        setDeleteTarget(null);
      },
      onError: () => toast.error('No se pudo eliminar el movimiento'),
    });
  }

  // ─── Loading / Error ──────────────────────────────────────────────────────
  if (errorLote) {
    return (
      <div className="space-y-6">
        <BackButton onBack={() => { void navigate('/granja/lotes'); }} />
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudo cargar el lote. Intentá recargar la página.
          </p>
        </div>
      </div>
    );
  }

  if (loadingLote || lote === undefined) {
    return (
      <div className="space-y-6">
        <BackButton onBack={() => { void navigate('/granja/lotes'); }} />
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  const estaActivo = lote.estado === 'ACTIVO';
  const esMortalidadTotal = lote.resumen.costoPorPolloVivo === null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb / back */}
      <BackButton onBack={() => { void navigate('/granja/lotes'); }} />

      {/* Título */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold">
              {lote.nombre ?? `Lote ${lote.id.slice(0, 8)}`}
            </h1>
            <Badge variant={estaActivo ? 'default' : 'secondary'}>
              {estaActivo ? 'Activo' : 'Cerrado'}
            </Badge>
          </div>
          {lote.galpon !== null ? (
            <p className="text-sm md:text-base text-muted-foreground">Galpón: {lote.galpon}</p>
          ) : null}
        </div>

        {estaActivo ? (
          <Can permission={PERMISSIONS.granja.lotes.update}>
            <Button
              variant="outline"
              className="self-start text-destructive hover:text-destructive min-h-[44px]"
              onClick={() => setCerrarDialogOpen(true)}
            >
              Cerrar lote
            </Button>
          </Can>
        ) : null}
      </div>

      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Costo / pollo vivo"
          value={formatCostoPorPollo(lote.resumen.costoPorPolloVivo)}
          highlight
          alert={esMortalidadTotal}
        />
        <MetricCard label="Aves vivas" value={lote.resumen.avesVivas.toLocaleString()} />
        <MetricCard
          label="Mortalidad"
          value={formatPorcentajeMortalidad(lote.resumen.porcentajeMortalidad)}
        />
        <MetricCard label="Edad" value={`${lote.resumen.edadDias} días`} />
      </div>

      {/* Info del lote */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Información del lote
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Cantidad inicial" value={`${lote.cantidadInicial.toLocaleString()} aves`} />
          <InfoRow label="Ingreso" value={formatFechaGranja(lote.fechaIngreso)} />
          {lote.fechaEstimadaSaca !== null ? (
            <InfoRow label="Saca estimada" value={formatFechaGranja(lote.fechaEstimadaSaca)} />
          ) : null}
          {lote.fechaCierre !== null ? (
            <InfoRow label="Fecha cierre" value={formatFechaGranja(lote.fechaCierre)} />
          ) : null}
          <InfoRow label="Costo acumulado" value={`Bs ${lote.resumen.costoAcumulado}`} />
          {lote.detalle !== null ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <InfoRow label="Detalle" value={lote.detalle} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Desglose de costos por tipo (CLIENT-SIDE) */}
      {desgloseCostos.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Desglose de costos por tipo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {desgloseCostos.map((item) => (
              <div key={item.tipoId} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.nombre}</span>
                <span className="font-medium tabular-nums">Bs {item.total}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Acciones de registro — directas, sin pestañas. Un modo oculto (tab)
          es fricción para un usuario mayor en celular: dos botones grandes que
          abren el formulario correcto al toque. */}
      {estaActivo ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <PermissionButton
            permission={PERMISSIONS.granja.movimientos.create}
            deniedReason="No tenés permiso para registrar movimientos"
            onClick={() => setAddInversionOpen(true)}
            className="w-full min-h-[44px] sm:flex-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            Registrar gasto
          </PermissionButton>
          <PermissionButton
            permission={PERMISSIONS.granja.movimientos.create}
            deniedReason="No tenés permiso para registrar movimientos"
            variant="outline"
            onClick={() => setAddCantidadOpen(true)}
            className="w-full min-h-[44px] sm:flex-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            Registrar mortalidad
          </PermissionButton>
        </div>
      ) : null}

      {/* Gastos */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Gastos
        </h2>
        {loadingMovimientos ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (movimientos?.inversiones ?? []).length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">No hay gastos registrados.</p>
          </div>
        ) : (
          <div className="space-y-1 overflow-x-auto">
            <div className="min-w-[500px]">
              {(movimientos?.inversiones ?? []).map((inv) => (
                <InversionRow
                  key={inv.id}
                  inversion={inv}
                  tipoNombre={tiposRegistro?.find((t) => t.id === inv.tipoRegistroId)?.nombre ?? '—'}
                  canDelete={estaActivo}
                  onDelete={() => setDeleteTarget({ tipo: 'inversion', movId: inv.id })}
                  isDeleting={deleteMovimiento.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Mortalidad */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Mortalidad
        </h2>
        {loadingMovimientos ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (movimientos?.cantidades ?? []).length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">No hay registros de mortalidad.</p>
          </div>
        ) : (
          <div className="space-y-1 overflow-x-auto">
            <div className="min-w-[500px]">
              {(movimientos?.cantidades ?? []).map((cant) => (
                <CantidadRow
                  key={cant.id}
                  cantidad={cant}
                  tipoNombre={tiposRegistro?.find((t) => t.id === cant.tipoRegistroId)?.nombre ?? '—'}
                  canDelete={estaActivo}
                  onDelete={() => setDeleteTarget({ tipo: 'cantidad', movId: cant.id })}
                  isDeleting={deleteMovimiento.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* AlertDialog: confirmar cierre del lote */}
      <AlertDialog open={cerrarDialogOpen} onOpenChange={setCerrarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar este lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez cerrado, ya no podrás registrar movimientos en este lote.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCerrarConfirm}
              disabled={cerrarLote.isPending}
            >
              {cerrarLote.isPending ? 'Cerrando…' : 'Cerrar lote'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: nuevo movimiento de inversión */}
      <Dialog open={addInversionOpen} onOpenChange={setAddInversionOpen}>
        <DialogContent className="sm:max-w-xl max-w-none h-full sm:h-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar gasto</DialogTitle>
          </DialogHeader>
          <div className="pb-4">
            <MovimientoInversionForm
              onSubmit={handleAddInversion}
              isSubmitting={createInversion.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: confirmar borrado de un movimiento */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              El registro se eliminará de forma permanente y el costo por pollo
              se recalculará. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMovimiento.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMovimiento.isPending ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: nuevo movimiento de cantidad */}
      <Dialog open={addCantidadOpen} onOpenChange={setAddCantidadOpen}>
        <DialogContent className="sm:max-w-xl max-w-none h-full sm:h-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar mortalidad</DialogTitle>
          </DialogHeader>
          <div className="pb-4">
            <MovimientoCantidadForm
              onSubmit={handleAddCantidad}
              isSubmitting={createCantidad.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Subcomponentes internos ──────────────────────────────────────────────────

function BackButton({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2 min-h-[44px] sm:min-h-[36px]">
      <ChevronLeft className="h-4 w-4" />
      Volver a lotes
    </Button>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  highlight?: boolean;
  alert?: boolean;
}

function MetricCard({ label, value, highlight = false, alert = false }: MetricCardProps): React.JSX.Element {
  return (
    <Card className={alert ? 'border-destructive/50 bg-destructive/5' : undefined}>
      <CardContent className="pt-4 pb-4 text-center">
        {alert ? (
          <div className="flex items-center justify-center gap-1.5 mb-1 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Mortalidad total</span>
          </div>
        ) : null}
        <p
          className={[
            'tabular-nums font-bold leading-none',
            highlight ? 'text-3xl' : 'text-2xl',
            alert ? 'text-destructive' : 'text-foreground',
          ].join(' ')}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

interface InversionRowProps {
  inversion: MovimientoInversionResponse;
  tipoNombre: string;
  canDelete: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}

function InversionRow({ inversion, tipoNombre, canDelete, onDelete, isDeleting }: InversionRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-sm mb-1">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{tipoNombre}</p>
        <p className="text-xs text-muted-foreground">
          {formatFechaGranja(inversion.fecha)}
          {inversion.detalle !== null ? ` — ${inversion.detalle}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-medium tabular-nums whitespace-nowrap">Bs {inversion.monto}</span>
        {canDelete ? (
          <Can permission={PERMISSIONS.granja.movimientos.delete}>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              aria-label="Eliminar movimiento"
              className="text-muted-foreground hover:text-destructive disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-[32px] sm:min-w-[32px]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Can>
        ) : null}
      </div>
    </div>
  );
}

interface CantidadRowProps {
  cantidad: MovimientoCantidadResponse;
  tipoNombre: string;
  canDelete: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}

function CantidadRow({ cantidad, tipoNombre, canDelete, onDelete, isDeleting }: CantidadRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-sm mb-1">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{tipoNombre}</p>
        <p className="text-xs text-muted-foreground">
          {formatFechaGranja(cantidad.fecha)}
          {cantidad.detalle !== null ? ` — ${cantidad.detalle}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-medium tabular-nums whitespace-nowrap">
          {cantidad.cantidad.toLocaleString()} aves
        </span>
        {canDelete ? (
          <Can permission={PERMISSIONS.granja.movimientos.delete}>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              aria-label="Eliminar movimiento"
              className="text-muted-foreground hover:text-destructive disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-[32px] sm:min-w-[32px]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Can>
        ) : null}
      </div>
    </div>
  );
}
