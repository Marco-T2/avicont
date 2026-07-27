import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { backendErrorMessage } from '@/lib/error-messages';
import { PERMISSIONS } from '@/lib/permissions';
import { usePermissions } from '@/lib/use-permissions';
import type { CustomRole } from '@/types/api';

import { usePermissionsGrouped } from '../hooks/use-permissions';
import { useCreateRole, useDeleteRole, useUpdateRole } from '../hooks/use-roles';
import {
  type RoleFormValues,
  roleFormSchema,
} from '../schemas/role-form-schema';

import { PermissionsPicker } from './permissions-picker';

interface RoleDetailPanelProps {
  /** `undefined` = alta. */
  role: CustomRole | undefined;
  onGuardado: (role: CustomRole) => void;
  onEliminado: () => void;
  onCancelar: () => void;
}

const VACIO: RoleFormValues = {
  slug: '',
  name: '',
  description: '',
  permissions: [],
};

// Panel de detalle del editor de roles: identidad + árbol de permisos.
// Sirve para alta y edición; el modo lo decide `role`.
export function RoleDetailPanel({
  role,
  onGuardado,
  onEliminado,
  onCancelar,
}: RoleDetailPanelProps): React.JSX.Element {
  const isEdit = role !== undefined;
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const permissions = usePermissionsGrouped();
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();

  const { has } = usePermissions();
  // Un rol de plantilla no se toca (`isEditable` lo decide el backend). Sin el
  // permiso fino, el form se muestra en modo lectura en vez de esconderse: que
  // se vea qué concede el rol es útil incluso sin poder cambiarlo.
  const soloLectura = isEdit
    ? !role.isEditable || !has(PERMISSIONS.organizacion.roles.update)
    : false;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: VACIO,
  });

  useEffect(() => {
    reset(
      role === undefined
        ? VACIO
        : {
            slug: role.slug,
            name: role.name,
            description: role.description ?? '',
            permissions: role.permissions,
          },
    );
  }, [role, reset]);

  const pending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: RoleFormValues): void {
    if (isEdit) {
      updateMutation.mutate(
        {
          id: role.id,
          body: {
            name: values.name,
            ...(values.description !== undefined
              ? { description: values.description }
              : {}),
            permissions: values.permissions,
          },
        },
        {
          onSuccess: (actualizado) => {
            toast.success('Rol actualizado');
            onGuardado(actualizado);
          },
          onError: (err) =>
            toast.error(
              backendErrorMessage(err, 'No se pudo actualizar el rol'),
            ),
        },
      );
      return;
    }

    createMutation.mutate(
      {
        slug: values.slug,
        name: values.name,
        ...(values.description !== undefined && values.description.length > 0
          ? { description: values.description }
          : {}),
        permissions: values.permissions,
      },
      {
        onSuccess: (creado) => {
          toast.success('Rol creado');
          onGuardado(creado);
        },
        onError: (err) =>
          toast.error(backendErrorMessage(err, 'No se pudo crear el rol')),
      },
    );
  }

  function confirmarEliminar(): void {
    if (!isEdit) return;
    deleteMutation.mutate(role.id, {
      onSuccess: () => {
        toast.success(`Rol "${role.name}" eliminado`);
        setConfirmarBorrado(false);
        onEliminado();
      },
      onError: (err) =>
        toast.error(backendErrorMessage(err, 'No se pudo eliminar el rol')),
    });
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre visible</Label>
            <Input
              id="name"
              placeholder="Contador Junior"
              disabled={soloLectura}
              aria-invalid={errors.name !== undefined}
              className="text-base md:text-sm"
              {...register('name')}
            />
            {errors.name !== undefined ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Identificador (slug)</Label>
            <Input
              id="slug"
              placeholder="contador-junior"
              disabled={isEdit || soloLectura}
              aria-invalid={errors.slug !== undefined}
              className="text-base md:text-sm"
              {...register('slug')}
            />
            {errors.slug !== undefined ? (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No cambia después de crearlo.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Descripción (opcional)</Label>
          <Textarea
            id="description"
            rows={2}
            disabled={soloLectura}
            className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[60px] text-base md:text-sm"
            placeholder="Para quiénes es este rol y qué pueden hacer."
            aria-invalid={errors.description !== undefined}
            {...register('description')}
          />
          {errors.description !== undefined ? (
            <p className="text-xs text-destructive">
              {errors.description.message}
            </p>
          ) : null}
        </div>

        <Controller
          control={control}
          name="permissions"
          render={({ field }) => (
            <PermissionsPicker
              catalogo={permissions.data}
              loading={permissions.isLoading}
              selected={field.value}
              onChange={field.onChange}
              error={errors.permissions?.message}
              disabled={soloLectura}
            />
          )}
        />
      </div>

      {/* `sticky bottom-0`: el contenedor de scroll es el `main` del
          DashboardShell, así que el footer queda anclado al borde inferior de
          la ventana y el submit se ve sin recorrer el árbol de permisos. */}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur lg:mx-0 lg:px-0">
        {isEdit && role.isEditable && has(PERMISSIONS.organizacion.roles.delete) ? (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmarBorrado(true)}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Eliminar</span>
          </Button>
        ) : null}

        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancelar}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || soloLectura}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando…
              </>
            ) : isEdit ? (
              'Guardar cambios'
            ) : (
              'Crear rol'
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar rol</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar el rol <b>{role?.name}</b>? Los miembros asignados a este
              rol quedarán sin rol hasta que les asignes uno nuevo. Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarEliminar();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
