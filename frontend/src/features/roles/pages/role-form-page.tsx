import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { backendErrorMessage } from '@/lib/error-messages';

import { usePermissionsGrouped } from '../hooks/use-permissions';
import { useCreateRole, useRoles, useUpdateRole } from '../hooks/use-roles';
import {
  type RoleFormValues,
  roleFormSchema,
} from '../schemas/role-form-schema';

import { PermissionsPicker } from '../components/permissions-picker';

const RUTA_LISTADO = '/settings/roles';

// Página de alta y edición de roles personalizados.
//
// Vive en una ruta propia y no en un modal porque el catálogo asignable son ~68
// permisos en 21 submódulos: medido en el modal anterior, eran 5,4 pantallas de
// scroll en desktop y 8,4 en mobile, con el botón de guardar fuera de la vista
// en los tres viewports. Una página da el ancho completo (más columnas), un
// footer fijo y lugar para el buscador.
export function RoleFormPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const isEdit = id !== undefined;
  const navigate = useNavigate();

  const permissions = usePermissionsGrouped();
  const rolesQuery = useRoles();
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();

  // El rol a editar sale del cache del listado (`useRoles`), que es de donde se
  // llega. Si alguien entra por URL directa con el cache frío, la query se
  // dispara igual y el form se rellena cuando llega.
  const role = isEdit
    ? rolesQuery.data?.find((r) => r.id === id)
    : undefined;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { slug: '', name: '', description: '', permissions: [] },
  });

  useEffect(() => {
    if (role !== undefined) {
      reset({
        slug: role.slug,
        name: role.name,
        description: role.description ?? '',
        permissions: role.permissions,
      });
    }
  }, [role, reset]);

  const pending = createMutation.isPending || updateMutation.isPending;

  function volver(): void {
    void navigate(RUTA_LISTADO);
  }

  function onSubmit(values: RoleFormValues): void {
    if (isEdit && role !== undefined) {
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
          onSuccess: () => {
            toast.success('Rol actualizado');
            volver();
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
        onSuccess: () => {
          toast.success('Rol creado');
          volver();
        },
        onError: (err) =>
          toast.error(backendErrorMessage(err, 'No se pudo crear el rol')),
      },
    );
  }

  // En edición con el rol todavía sin resolver no se puede rellenar el form:
  // mostrarlo vacío invitaría a guardar y pisar el rol con campos en blanco.
  if (isEdit && role === undefined) {
    if (rolesQuery.isLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={volver}
          className="-ml-2 gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Roles personalizados
        </Button>
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm">
            No encontramos ese rol. Puede haber sido eliminado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={volver} className="-ml-2 gap-1">
        <ChevronLeft className="h-4 w-4" />
        Roles personalizados
      </Button>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold">
          {isEdit ? 'Editar rol' : 'Nuevo rol'}
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Los roles personalizados agrupan permisos para asignar a miembros.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        className="space-y-6"
        noValidate
      >
        <div className="space-y-4 rounded-md border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Identificador (slug)</Label>
              <Input
                id="slug"
                placeholder="contador-junior"
                disabled={isEdit}
                aria-invalid={errors.slug !== undefined}
                className="text-base md:text-sm"
                {...register('slug')}
              />
              {errors.slug !== undefined ? (
                <p className="text-xs text-destructive">
                  {errors.slug.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Usado en URLs y referencias. No cambia después de crearlo.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre visible</Label>
              <Input
                id="name"
                placeholder="Contador Junior"
                aria-invalid={errors.name !== undefined}
                className="text-base md:text-sm"
                {...register('name')}
              />
              {errors.name !== undefined ? (
                <p className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea
              id="description"
              rows={2}
              className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[80px] text-base md:text-sm"
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
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Permisos
          </h2>
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
              />
            )}
          />
        </div>

        {/* Footer fijo: el `main` del DashboardShell es el contenedor de scroll,
            así que `sticky bottom-0` lo ancla al borde inferior de la ventana.
            En el modal anterior el submit no era visible en NINGÚN viewport sin
            scrollear las 5 pantallas del catálogo. */}
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:-mx-8 lg:px-8">
          <Controller
            control={control}
            name="permissions"
            render={({ field }) => (
              <p className="text-sm text-muted-foreground">
                {field.value.length} permiso
                {field.value.length === 1 ? '' : 's'} seleccionado
                {field.value.length === 1 ? '' : 's'}
              </p>
            )}
          />

          {/* En fila incluso en mobile: apilados, el footer fijo se comía 150px
              de un viewport de 667. Los dos botones ocupan media pantalla cada
              uno, que sigue siendo un tap target holgado. */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={volver}
              disabled={pending}
              className="flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="flex-1 sm:flex-none">
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
      </form>
    </div>
  );
}
