import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { type LoteFormValues, loteSchema } from '../schemas/lote.schema';

interface LoteFormInitialData {
  cantidadInicial?: number;
  fechaIngreso?: string;
  nombre?: string;
  galpon?: string;
  fechaEstimadaSaca?: string;
  detalle?: string;
}

interface LoteFormProps {
  mode: 'create' | 'edit';
  initialData?: LoteFormInitialData;
  onSubmit: (values: LoteFormValues) => void;
  isSubmitting: boolean;
}

const DEFAULT_CREATE_VALUES: Partial<LoteFormValues> = {
  nombre: '',
  galpon: '',
  detalle: '',
};

function mapInitialData(data: LoteFormInitialData): Partial<LoteFormValues> {
  return {
    cantidadInicial: data.cantidadInicial,
    fechaIngreso: data.fechaIngreso ?? '',
    nombre: data.nombre ?? '',
    galpon: data.galpon ?? '',
    fechaEstimadaSaca: data.fechaEstimadaSaca ?? '',
    detalle: data.detalle ?? '',
  };
}

export function LoteForm({ mode, initialData, onSubmit, isSubmitting }: LoteFormProps): React.JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoteFormValues>({
    // Cast necesario: loteSchema usa .optional() y los valores por defecto
    // hacen que el input type difiera del output type de z.infer.
    resolver: zodResolver(loteSchema) as Resolver<LoteFormValues>,
    defaultValues:
      mode === 'edit' && initialData !== undefined
        ? mapInitialData(initialData)
        : DEFAULT_CREATE_VALUES,
  });

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      {/* Nombre */}
      <Field label="Nombre" htmlFor="nombre" error={errors.nombre?.message}>
        <Input
          {...register('nombre')}
          id="nombre"
          placeholder="Ej. Lote Enero 2026"
          className="text-base md:text-sm"
          aria-invalid={errors.nombre !== undefined}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Cantidad inicial — DESHABILITADO en edición */}
        <Field
          label="Cantidad inicial"
          htmlFor="cantidadInicial"
          required
          error={errors.cantidadInicial?.message}
        >
          <Input
            {...register('cantidadInicial', { valueAsNumber: true })}
            id="cantidadInicial"
            type="number"
            min={1}
            placeholder="5000"
            disabled={mode === 'edit'}
            className={cn(
              'text-base md:text-sm',
              mode === 'edit' && 'cursor-not-allowed opacity-60',
            )}
            aria-invalid={errors.cantidadInicial !== undefined}
          />
          {mode === 'edit' ? (
            <p className="text-xs text-muted-foreground">
              La cantidad inicial no se puede modificar después de crear el lote.
            </p>
          ) : null}
        </Field>

        {/* Fecha de ingreso */}
        <Field
          label="Fecha de ingreso"
          htmlFor="fechaIngreso"
          required
          error={errors.fechaIngreso?.message}
        >
          <Input
            {...register('fechaIngreso')}
            id="fechaIngreso"
            type="date"
            className="text-base md:text-sm"
            aria-invalid={errors.fechaIngreso !== undefined}
          />
        </Field>
      </div>

      {/* Galpón */}
      <Field label="Galpón" htmlFor="galpon" error={errors.galpon?.message}>
        <Input
          {...register('galpon')}
          id="galpon"
          placeholder="Ej. Galpón A"
          className="text-base md:text-sm"
          aria-invalid={errors.galpon !== undefined}
        />
      </Field>

      {/* Fecha estimada de saca */}
      <Field
        label="Fecha estimada de saca"
        htmlFor="fechaEstimadaSaca"
        error={errors.fechaEstimadaSaca?.message}
      >
        <Input
          {...register('fechaEstimadaSaca')}
          id="fechaEstimadaSaca"
          type="date"
          className="text-base md:text-sm"
          aria-invalid={errors.fechaEstimadaSaca !== undefined}
        />
      </Field>

      {/* Detalle */}
      <Field label="Detalle" htmlFor="detalle" error={errors.detalle?.message}>
        <Textarea
          {...register('detalle')}
          id="detalle"
          placeholder="Notas adicionales sobre el lote"
          className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[80px] text-base md:text-sm"
          aria-invalid={errors.detalle !== undefined}
        />
      </Field>

      {/* Submit */}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[44px] sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {mode === 'create' ? 'Creando…' : 'Guardando…'}
            </>
          ) : mode === 'create' ? (
            'Crear lote'
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Subcomponente interno ────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, required, error, className, children }: FieldProps): React.JSX.Element {
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
