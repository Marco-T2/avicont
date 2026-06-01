import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { estimarFechaSaca } from '../lib/estimar-fecha-saca';
import { hoyEnLaPaz } from '../lib/hoy-en-la-paz';
import { type LoteFormValues, loteSchema } from '../schemas/lote.schema';

// Engorde típico de parrillero ~42-49 días; 45 es el default operativo.
const DIAS_ENGORDE_DEFAULT = 45;

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

// Al crear, la fecha de ingreso arranca en "hoy" (La Paz): por defecto los
// pollitos entraron el día que se carga el lote. La fecha estimada de saca se
// estima a 45 días de ese ingreso. El usuario ajusta solo si difiere — un campo
// menos de fricción para usuarios mayores.
function buildCreateDefaults(): Partial<LoteFormValues> {
  const fechaIngreso = hoyEnLaPaz();
  return {
    nombre: '',
    galpon: '',
    detalle: '',
    fechaIngreso,
    fechaEstimadaSaca: estimarFechaSaca(fechaIngreso, DIAS_ENGORDE_DEFAULT),
  };
}

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
    setValue,
    getValues,
    formState: { errors },
  } = useForm<LoteFormValues>({
    // Cast necesario: loteSchema usa .optional() y los valores por defecto
    // hacen que el input type difiera del output type de z.infer.
    resolver: zodResolver(loteSchema) as Resolver<LoteFormValues>,
    defaultValues:
      mode === 'edit' && initialData !== undefined
        ? mapInitialData(initialData)
        : buildCreateDefaults(),
  });

  // Los "días de engorde" son un driver de UI (no se envían al backend): estiman
  // la fecha de saca desde el ingreso. Solo aplica al crear; en edición el lote
  // ya tiene su fecha y no la pisamos.
  const [diasEngorde, setDiasEngorde] = useState(String(DIAS_ENGORDE_DEFAULT));

  function recalcularSaca(fechaIngreso: string, dias: number): void {
    if (!Number.isFinite(dias)) return;
    setValue('fechaEstimadaSaca', estimarFechaSaca(fechaIngreso, dias));
  }

  function handleDiasChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const raw = e.target.value;
    setDiasEngorde(raw);
    if (raw === '') return;
    recalcularSaca(getValues('fechaIngreso'), Number(raw));
  }

  function handleFechaIngresoChange(e: React.ChangeEvent<HTMLInputElement>): void {
    if (mode !== 'create') return;
    recalcularSaca(e.target.value, Number(diasEngorde));
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
            {...register('fechaIngreso', { onChange: handleFechaIngresoChange })}
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

      {/* Fecha estimada de saca — al crear, se estima desde "días de engorde";
          la fecha queda editable por si el usuario la conoce con exactitud. */}
      {mode === 'create' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Días de engorde" htmlFor="diasEngorde">
            <Input
              id="diasEngorde"
              type="number"
              min={1}
              inputMode="numeric"
              value={diasEngorde}
              onChange={handleDiasChange}
              className="text-base md:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Estima la fecha de saca desde el ingreso.
            </p>
          </Field>
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
        </div>
      ) : (
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
      )}

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
