import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { TipoDocumentoFisico } from '@/types/api';

import {
  TIPO_COMPROBANTE_OPTIONS,
} from '../lib/build-tipos-documento-fisico-params';
import {
  DEFAULT_CREATE_VALUES,
  mapTipoToFormValues,
  type TipoDocumentoFisicoFormValues,
  tipoDocumentoFisicoFormSchema,
} from '../schemas/tipo-documento-fisico-form-schema';

interface TipoDocumentoFisicoFormProps {
  mode: 'create' | 'edit';
  initialData?: TipoDocumentoFisico;
  onSubmit: (values: TipoDocumentoFisicoFormValues) => void;
  isSubmitting: boolean;
}

export function TipoDocumentoFisicoForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: TipoDocumentoFisicoFormProps): React.JSX.Element {
  const form = useForm<TipoDocumentoFisicoFormValues>({
    // zodResolver infiere desde el input type; el cast resuelve la discrepancia
    // entre input (campos con .default opcionales) y output (todos requeridos).
    resolver: zodResolver(tipoDocumentoFisicoFormSchema) as Resolver<TipoDocumentoFisicoFormValues>,
    defaultValues:
      mode === 'edit' && initialData !== undefined
        ? mapTipoToFormValues(initialData)
        : DEFAULT_CREATE_VALUES,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const seleccionados = watch('tiposComprobanteAplicables');

  function toggleTipoComprobante(value: string, checked: boolean): void {
    const next = checked
      ? [...seleccionados, value as TipoDocumentoFisicoFormValues['tiposComprobanteAplicables'][number]]
      : seleccionados.filter((v) => v !== value);
    setValue('tiposComprobanteAplicables', next, { shouldDirty: true });
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      <Field
        label="Nombre"
        htmlFor="nombre"
        required
        error={errors.nombre?.message}
      >
        <Input
          {...register('nombre')}
          id="nombre"
          placeholder="Nombre del tipo de documento"
          className="text-base md:text-sm"
          aria-invalid={errors.nombre !== undefined}
        />
      </Field>

      <Field
        label="Código"
        htmlFor="codigo"
        required={mode === 'create'}
        error={errors.codigo?.message}
      >
        <Input
          {...register('codigo')}
          id="codigo"
          placeholder="factura-recibida"
          className="text-base md:text-sm"
          aria-invalid={errors.codigo !== undefined}
          disabled={mode === 'edit'}
        />
        {mode === 'edit' ? (
          <p className="text-xs text-muted-foreground">
            El código no se puede modificar.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Solo minúsculas, números y guiones (ej: factura-recibida).
          </p>
        )}
      </Field>

      {/* Es tributario */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-3 rounded-md border px-3 py-3">
          <Checkbox
            id="esTributario"
            checked={watch('esTributario')}
            onCheckedChange={(v) =>
              setValue('esTributario', v === true, { shouldDirty: true })
            }
            className="mt-0.5"
          />
          <div className="flex-1">
            <Label htmlFor="esTributario" className="cursor-pointer">
              Es tributario
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              El documento está asociado a obligaciones fiscales.
            </p>
          </div>
        </div>
      </div>

      {/* Checkbox activo — solo visible en modo edit */}
      {mode === 'edit' ? (
        <div className="space-y-1.5">
          <div className="flex items-start gap-3 rounded-md border px-3 py-3">
            <Checkbox
              id="activo"
              checked={watch('activo')}
              onCheckedChange={(v) =>
                setValue('activo', v === true, { shouldDirty: true })
              }
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="activo" className="cursor-pointer">
                Activo
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Los tipos inactivos no pueden usarse en documentos nuevos.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Checkbox group — Tipos de comprobante aplicables */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Tipos de comprobante aplicables
        </legend>
        <p className="text-xs text-muted-foreground">
          Opcional. Indica en qué tipos de comprobante se puede usar este documento.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPO_COMPROBANTE_OPTIONS.map(({ value, label }) => (
            <div
              key={value}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <Checkbox
                id={`tipo-${value}`}
                checked={seleccionados.includes(value)}
                onCheckedChange={(v) => toggleTipoComprobante(value, v === true)}
              />
              <Label htmlFor={`tipo-${value}`} className="cursor-pointer text-sm">
                {label}
              </Label>
            </div>
          ))}
        </div>
        {errors.tiposComprobanteAplicables !== undefined ? (
          <p className="text-xs text-destructive">
            {errors.tiposComprobanteAplicables.message}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando…
            </>
          ) : mode === 'create' ? (
            'Crear tipo'
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Subcomponente interno Field
// ------------------------------------------------------------

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
      {error !== undefined ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
