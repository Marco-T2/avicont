import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { backendErrorMessage } from '@/lib/error-messages';
import type { CustomRole } from '@/types/api';

import { usePermissionsGrouped } from '../hooks/use-permissions';
import { useCreateRole, useUpdateRole } from '../hooks/use-roles';
import {
  type RoleFormValues,
  roleFormSchema,
} from '../schemas/role-form-schema';

import { PermissionsPicker } from './permissions-picker';

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Si se provee, el dialog opera en modo edición; si no, modo creación.
  role?: CustomRole;
}

// Dialog compartido para crear y editar roles personalizados. En edición
// el slug queda read-only (el backend no lo permite cambiar; sería una
// breaking change para integrations existentes).
export function RoleFormDialog({
  open,
  onOpenChange,
  role,
}: RoleFormDialogProps): React.JSX.Element {
  const isEdit = role !== undefined;
  const permissions = usePermissionsGrouped();
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      slug: role?.slug ?? '',
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
    },
  });

  // Al abrir/cambiar el rol editado, resetear el form para reflejar los
  // valores actuales (sin esto el dialog mantiene el form anterior).
  useEffect(() => {
    if (open) {
      reset({
        slug: role?.slug ?? '',
        name: role?.name ?? '',
        description: role?.description ?? '',
        permissions: role?.permissions ?? [],
      });
    }
  }, [open, role, reset]);

  const pending = createMutation.isPending || updateMutation.isPending;

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
            onOpenChange(false);
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
          reset();
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(backendErrorMessage(err, 'No se pudo crear el rol')),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar rol' : 'Nuevo rol'}</DialogTitle>
          <DialogDescription>
            Los roles personalizados agrupan permisos para asignar a miembros.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Identificador (slug)</Label>
              <Input
                id="slug"
                placeholder="contador-junior"
                disabled={isEdit}
                aria-invalid={errors.slug !== undefined}
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

          <div className="space-y-2">
            <Label>Permisos</Label>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
