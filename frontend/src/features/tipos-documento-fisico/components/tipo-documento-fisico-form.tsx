import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { Resolver } from 'react-hook-form';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
    control,
    setValue,
    formState: { errors },
  } = form;

  const seleccionados = useWatch({ control, name: 'tiposComprobanteAplicables' });
  const esTributario = useWatch({ control, name: 'esTributario' });
  const activo = useWatch({ control, name: 'activo' });
  const numeracionAutomatica = useWatch({ control, name: 'numeracionAutomatica' });
  const numeroInicialValue = useWatch({ control, name: 'numeroInicial' });

  function toggleTipoComprobante(value: string, checked: boolean): void {
    const next = checked
      ? [...seleccionados, value as TipoDocumentoFisicoFormValues['tiposComprobanteAplicables'][number]]
      : seleccionados.filter((v) => v !== value);
    setValue('tiposComprobanteAplicables', next, { shouldDirty: true });
  }

  function handleNumeracionAutomaticaChange(checked: boolean): void {
    // Regla auto⇒¬tributario: si se activa auto y el tipo es tributario, no se permite.
    // El gating está en el JSX (disabled), pero como doble red de seguridad: si esTributario
    // está activo, no permitir activar auto.
    if (checked && esTributario) return;
    setValue('numeracionAutomatica', checked, { shouldDirty: true });
    if (!checked) {
      // Al desactivar auto, limpiar numeroInicial.
      setValue('numeroInicial', null, { shouldDirty: true });
    } else {
      // Al activar auto, poner default 1 si no tiene valor.
      setValue('numeroInicial', 1, { shouldDirty: true });
    }
  }

  function handleEsTributarioChange(checked: boolean): void {
    setValue('esTributario', checked, { shouldDirty: true });
    // Si se activa tributario con auto encendido → apagar auto (regla auto⇒¬tributario).
    if (checked && numeracionAutomatica) {
      setValue('numeracionAutomatica', false, { shouldDirty: true });
      setValue('numeroInicial', null, { shouldDirty: true });
    }
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
            checked={esTributario}
            onCheckedChange={(v) => handleEsTributarioChange(v === true)}
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

      {/* Numeración automática — set-once (disabled en edit) */}
      <div className="space-y-1.5">
        <div className={cn(
          'flex items-start gap-3 rounded-md border px-3 py-3',
          (esTributario || mode === 'edit') && 'opacity-60',
        )}>
          <Switch
            id="numeracionAutomatica"
            checked={numeracionAutomatica}
            onCheckedChange={handleNumeracionAutomaticaChange}
            disabled={esTributario || mode === 'edit'}
            aria-label="Numeración automática"
          />
          <div className="flex-1">
            <Label htmlFor="numeracionAutomatica" className={cn('cursor-pointer', (esTributario || mode === 'edit') && 'cursor-not-allowed')}>
              Numeración automática
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === 'edit'
                ? 'La numeración no se puede cambiar una vez creado el tipo.'
                : esTributario
                  ? 'No disponible para tipos tributarios.'
                  : 'El sistema asigna el número correlativo del documento automáticamente.'}
            </p>
          </div>
        </div>
      </div>

      {/* Número inicial — solo visible cuando numeracionAutomatica=true y mode=create */}
      {numeracionAutomatica && mode === 'create' ? (
        <Field
          label="Número inicial"
          htmlFor="numeroInicial"
          error={errors.numeroInicial?.message}
        >
          <Input
            id="numeroInicial"
            type="number"
            min={1}
            step={1}
            placeholder="1"
            className="text-base md:text-sm"
            aria-invalid={errors.numeroInicial !== undefined}
            value={numeroInicialValue ?? 1}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              setValue(
                'numeroInicial',
                isNaN(parsed) ? null : parsed,
                { shouldValidate: true },
              );
            }}
          />
          <p className="text-xs text-muted-foreground">
            Primer número de la secuencia correlativa. Mínimo 1.
          </p>
        </Field>
      ) : null}

      {/* Número inicial — solo lectura en modo edit con numeracionAutomatica=true */}
      {numeracionAutomatica && mode === 'edit' ? (
        <Field
          label="Número inicial"
          htmlFor="numeroInicial-readonly"
        >
          <Input
            id="numeroInicial-readonly"
            type="number"
            value={numeroInicialValue ?? 1}
            disabled
            className="text-base md:text-sm"
            aria-label="Número inicial"
          />
          <p className="text-xs text-muted-foreground">
            El número inicial no puede modificarse una vez creado el tipo.
          </p>
        </Field>
      ) : null}

      {/* Checkbox activo — solo visible en modo edit */}
      {mode === 'edit' ? (
        <div className="space-y-1.5">
          <div className="flex items-start gap-3 rounded-md border px-3 py-3">
            <Checkbox
              id="activo"
              checked={activo}
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
