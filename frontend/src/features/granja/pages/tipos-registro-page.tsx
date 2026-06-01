import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Can } from '@/components/shared/can';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { PERMISSIONS } from '@/lib/permissions';

import type { TipoRegistroResponse } from '../api/granja.types';
import {
  useCreateTipoRegistro,
  useDeleteTipoRegistro,
  useUpdateTipoRegistro,
} from '../hooks/use-granja-mutations';
import { useTiposRegistro } from '../hooks/use-granja-queries';
import { tipoRegistroSchema, type TipoRegistroFormValues } from '../schemas/tipo-registro.schema';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';

export function TiposRegistroPage(): React.JSX.Element {
  const { data: tipos, isLoading, isError } = useTiposRegistro();
  const [createOpen, setCreateOpen] = useState(false);

  const inversiones = (tipos ?? []).filter((t) => t.naturaleza === 'INVERSION');
  const cantidades = (tipos ?? []).filter((t) => t.naturaleza === 'CANTIDAD');

  return (
    <div className="space-y-6">
      {/* Header canónico §13.1 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Tipos de registro</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Categorías para clasificar tus gastos y la mortalidad.
          </p>
        </div>
        <Can permission={PERMISSIONS.granja.tiposRegistro.create}>
          <Button onClick={() => setCreateOpen(true)} className="self-start min-h-[44px]">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo tipo
          </Button>
        </Can>
      </div>

      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudieron cargar los tipos de registro. Intentá recargar.
          </p>
        </div>
      ) : isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="space-y-8">
          {/* Sección INVERSIÓN (gastos) */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Gastos
            </h2>
            {inversiones.length === 0 ? (
              <EmptySection />
            ) : (
              <div className="space-y-1">
                {inversiones.map((tipo) => (
                  <TipoRow key={tipo.id} tipo={tipo} />
                ))}
              </div>
            )}
          </section>

          {/* Sección CANTIDAD (mortalidad) */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Mortalidad
            </h2>
            {cantidades.length === 0 ? (
              <EmptySection />
            ) : (
              <div className="space-y-1">
                {cantidades.map((tipo) => (
                  <TipoRow key={tipo.id} tipo={tipo} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Dialog crear */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-w-none h-full sm:h-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo tipo de registro</DialogTitle>
          </DialogHeader>
          <div className="pb-4">
            <CreateTipoRegistroForm onClose={() => setCreateOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Fila de tipo de registro ─────────────────────────────────────────────────

function TipoRow({ tipo }: { tipo: TipoRegistroResponse }): React.JSX.Element {
  const updateTipo = useUpdateTipoRegistro(tipo.id);
  const deleteTipo = useDeleteTipoRegistro();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleToggleActivo(checked: boolean): void {
    updateTipo.mutate(
      { activo: checked },
      {
        onError: () => toast.error('No se pudo actualizar el estado'),
      },
    );
  }

  function handleDeleteConfirm(e: React.MouseEvent): void {
    e.preventDefault();
    deleteTipo.mutate(tipo.id, {
      onSuccess: () => {
        toast.success('Tipo eliminado');
        setConfirmOpen(false);
      },
      onError: () => toast.error('No se pudo eliminar el tipo'),
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-4 py-3">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        <span className="font-medium text-sm truncate">{tipo.nombre}</span>
        {tipo.esSistema ? (
          <Badge variant="secondary" className="shrink-0 text-xs">
            Sistema
          </Badge>
        ) : null}
        {!tipo.activo ? (
          <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
            Inactivo
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Toggle activo — solo para tipos no-sistema */}
        {!tipo.esSistema ? (
          <Can permission={PERMISSIONS.granja.tiposRegistro.update}>
            <div className="flex items-center gap-2">
              <Switch
                checked={tipo.activo}
                onCheckedChange={handleToggleActivo}
                disabled={updateTipo.isPending}
                aria-label={tipo.activo ? 'Desactivar tipo' : 'Activar tipo'}
              />
              {updateTipo.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </div>
          </Can>
        ) : null}

        {/* Eliminar — solo si no es sistema */}
        {!tipo.esSistema ? (
          <Can permission={PERMISSIONS.granja.tiposRegistro.delete}>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={deleteTipo.isPending}
              aria-label={`Eliminar ${tipo.nombre}`}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-[32px] sm:min-w-[32px]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Can>
        ) : null}
      </div>

      {/* Confirmación de borrado — acción permanente */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar &ldquo;{tipo.nombre}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteTipo.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTipo.isPending ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Form de crear ────────────────────────────────────────────────────────────

interface CreateFormProps {
  onClose: () => void;
}

function CreateTipoRegistroForm({ onClose }: CreateFormProps): React.JSX.Element {
  const createTipo = useCreateTipoRegistro();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TipoRegistroFormValues>({
    resolver: zodResolver(tipoRegistroSchema) as Resolver<TipoRegistroFormValues>,
    defaultValues: { nombre: '', naturaleza: 'INVERSION' },
  });

  function onSubmit(values: TipoRegistroFormValues): void {
    createTipo.mutate(values, {
      onSuccess: () => {
        toast.success('Tipo creado correctamente');
        onClose();
      },
      onError: () => toast.error('No se pudo crear el tipo'),
    });
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      {/* Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="tipo-nombre" className="flex items-center gap-1">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          {...register('nombre')}
          id="tipo-nombre"
          placeholder="Ej. Suplementos"
          className="text-base md:text-sm"
          aria-invalid={errors.nombre !== undefined}
        />
        {errors.nombre !== undefined ? (
          <p className="text-xs text-destructive">{errors.nombre.message}</p>
        ) : null}
      </div>

      {/* Naturaleza */}
      <div className="space-y-1.5">
        <Label htmlFor="tipo-naturaleza" className="flex items-center gap-1">
          ¿Gasto o mortalidad? <span className="text-destructive">*</span>
        </Label>
        <select
          {...register('naturaleza')}
          id="tipo-naturaleza"
          aria-invalid={errors.naturaleza !== undefined}
          className={[
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
            'text-base md:text-sm ring-offset-background min-h-[44px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          ].join(' ')}
        >
          <option value="INVERSION">Gasto (dinero)</option>
          <option value="CANTIDAD">Mortalidad (aves)</option>
        </select>
        {errors.naturaleza !== undefined ? (
          <p className="text-xs text-destructive">{errors.naturaleza.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="w-full min-h-[44px] sm:w-auto"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={createTipo.isPending}
          className="w-full min-h-[44px] sm:w-auto"
        >
          {createTipo.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creando…
            </>
          ) : (
            'Crear tipo'
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Subcomponentes auxiliares ────────────────────────────────────────────────

function LoadingSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-8">
      {[0, 1].map((group) => (
        <div key={group} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptySection(): React.JSX.Element {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
      <p className="text-sm text-muted-foreground">Sin tipos de registro en esta categoría.</p>
    </div>
  );
}
