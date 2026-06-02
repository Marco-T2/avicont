import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  CreateFeatureFlagRequest,
  FeatureFlag,
  UpdateFeatureFlagRequest,
} from '@/types/api';

import { useCreateFeatureFlag } from '../hooks/use-create-feature-flag';
import { useUpdateFeatureFlag } from '../hooks/use-update-feature-flag';
import {
  DEFAULT_FEATURE_FLAG_VALUES,
  type FeatureFlagFormValues,
  featureFlagSchema,
} from '../schemas/feature-flag-schema';

interface FeatureFlagSheetProps {
  // null → crear; presente → editar (la key es inmutable).
  flag: FeatureFlag | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function valoresDeFlag(flag: FeatureFlag | null): FeatureFlagFormValues {
  if (flag === null) return DEFAULT_FEATURE_FLAG_VALUES;
  return {
    key: flag.key,
    name: flag.name,
    description: flag.description ?? '',
    enabled: flag.enabled,
  };
}

function buildCreatePayload(values: FeatureFlagFormValues): CreateFeatureFlagRequest {
  const description = values.description?.trim();
  return {
    key: values.key,
    name: values.name,
    enabled: values.enabled,
    ...(description !== undefined && description.length > 0 ? { description } : {}),
  };
}

function buildUpdatePayload(values: FeatureFlagFormValues): UpdateFeatureFlagRequest {
  const description = values.description?.trim() ?? '';
  return {
    name: values.name,
    enabled: values.enabled,
    // Cadena vacía limpia la descripción explícitamente (el backend la persiste).
    description,
  };
}

/**
 * Sheet-form de creación/edición de un feature flag global (super-admin, PR-4).
 * En modo edición la `key` se muestra deshabilitada (es el identificador del
 * recurso, inmutable). Cierra el drawer solo en éxito; en error (409 key
 * duplicada / 404 no encontrada) el form sigue abierto. Los toasts los emiten
 * useCreateFeatureFlag / useUpdateFeatureFlag (Anti-F-13).
 */
export function FeatureFlagSheet({
  flag,
  open,
  onOpenChange,
}: FeatureFlagSheetProps): React.JSX.Element {
  const esEdicion = flag !== null;
  const createMutation = useCreateFeatureFlag();
  const updateMutation = useUpdateFeatureFlag();
  const isPending = esEdicion ? updateMutation.isPending : createMutation.isPending;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeatureFlagFormValues>({
    resolver: zodResolver(featureFlagSchema),
    defaultValues: valoresDeFlag(flag),
  });

  // Re-sincroniza el form cuando cambia el flag seleccionado (otra fila o crear).
  useEffect(() => {
    reset(valoresDeFlag(flag));
  }, [flag, reset]);

  function handleOpenChange(next: boolean): void {
    if (!next) reset(valoresDeFlag(flag));
    onOpenChange(next);
  }

  function onSubmit(values: FeatureFlagFormValues): void {
    if (esEdicion) {
      updateMutation.mutate(
        { key: flag.key, body: buildUpdatePayload(values) },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    createMutation.mutate(buildCreatePayload(values), {
      onSuccess: () => {
        reset(DEFAULT_FEATURE_FLAG_VALUES);
        onOpenChange(false);
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>{esEdicion ? 'Editar feature flag' : 'Nueva feature flag'}</SheetTitle>
          <SheetDescription>
            {esEdicion
              ? 'Modificá el nombre, la descripción o el estado del flag. La clave no se puede cambiar.'
              : 'Creá un feature flag global. La clave debe ser única y respetar el formato (minúsculas, guion bajo).'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="space-y-5"
            noValidate
          >
            <Field label="Clave" htmlFor="ff-key" required error={errors.key?.message}>
              <Input
                {...register('key')}
                id="ff-key"
                placeholder="new_dashboard"
                disabled={esEdicion}
                autoComplete="off"
                className="text-base md:text-sm"
                aria-invalid={errors.key !== undefined}
              />
              <p className="text-xs text-muted-foreground">
                Minúsculas, números y guion bajo. Empieza con letra.
              </p>
            </Field>

            <Field label="Nombre" htmlFor="ff-name" required error={errors.name?.message}>
              <Input
                {...register('name')}
                id="ff-name"
                placeholder="Nuevo dashboard"
                className="text-base md:text-sm"
                aria-invalid={errors.name !== undefined}
              />
            </Field>

            <Field
              label="Descripción"
              htmlFor="ff-description"
              error={errors.description?.message}
            >
              <Textarea
                {...register('description')}
                id="ff-description"
                placeholder="Para qué sirve este flag (opcional)"
                className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[80px] text-base md:text-sm"
                aria-invalid={errors.description !== undefined}
              />
            </Field>

            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                  <Label htmlFor="ff-enabled" className="font-normal">
                    Habilitada
                  </Label>
                  <Switch
                    id="ff-enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />

            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {esEdicion ? 'Guardando…' : 'Creando…'}
                  </>
                ) : esEdicion ? (
                  'Guardar cambios'
                ) : (
                  'Crear feature flag'
                )}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | undefined;
  className?: string;
  children: React.ReactNode;
}

function Field({
  label,
  htmlFor,
  required,
  error,
  className,
  children,
}: FieldProps): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="flex items-center gap-1">
        {label}
        {required === true ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error !== undefined ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
