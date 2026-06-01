import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { useTiposRegistro } from '../hooks/use-granja-queries';
import {
  type MovimientoCantidadFormValues,
  movimientoCantidadSchema,
} from '../schemas/movimiento-cantidad.schema';

interface MovimientoCantidadFormProps {
  onSubmit: (values: MovimientoCantidadFormValues) => void;
  isSubmitting: boolean;
}

const DEFAULT_VALUES: Partial<MovimientoCantidadFormValues> = {
  fecha: '',
  tipoRegistroId: '',
  detalle: '',
};

/**
 * Form para registrar un movimiento de cantidad (ej. mortalidad) en un lote.
 * - `cantidad` como input numérico entero, mínimo 1.
 * - Selector de TipoRegistro filtrado por `naturaleza='CANTIDAD'`.
 */
export function MovimientoCantidadForm({
  onSubmit,
  isSubmitting,
}: MovimientoCantidadFormProps): React.JSX.Element {
  const { data: tipos, isLoading: cargandoTipos } = useTiposRegistro('CANTIDAD');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MovimientoCantidadFormValues>({
    resolver: zodResolver(movimientoCantidadSchema) as Resolver<MovimientoCantidadFormValues>,
    defaultValues: DEFAULT_VALUES,
  });

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      {/* Cantidad — int ≥ 1 */}
      <Field label="Cantidad" htmlFor="cantidad" required error={errors.cantidad?.message}>
        <Input
          {...register('cantidad', { valueAsNumber: true })}
          id="cantidad"
          type="number"
          min={1}
          step={1}
          placeholder="Ej. 50"
          className="text-base md:text-sm"
          aria-invalid={errors.cantidad !== undefined}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Fecha */}
        <Field label="Fecha" htmlFor="fecha" required error={errors.fecha?.message}>
          <Input
            {...register('fecha')}
            id="fecha"
            type="date"
            className="text-base md:text-sm"
            aria-invalid={errors.fecha !== undefined}
          />
        </Field>

        {/* Tipo de registro — select nativo, filtrado por CANTIDAD */}
        <Field
          label="Tipo de registro"
          htmlFor="tipoRegistroId"
          required
          error={errors.tipoRegistroId?.message}
        >
          <select
            {...register('tipoRegistroId')}
            id="tipoRegistroId"
            disabled={cargandoTipos}
            aria-invalid={errors.tipoRegistroId !== undefined}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
              'text-base md:text-sm ring-offset-background',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'min-h-[44px]',
            )}
          >
            <option value="">
              {cargandoTipos ? 'Cargando tipos...' : 'Seleccionar tipo'}
            </option>
            {(tipos ?? []).map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Detalle opcional (Anti-F-14: Textarea con [field-sizing:fixed]) */}
      <Field label="Detalle" htmlFor="detalle" error={errors.detalle?.message}>
        <Textarea
          {...register('detalle')}
          id="detalle"
          placeholder="Notas opcionales sobre el movimiento"
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
              Registrando…
            </>
          ) : (
            'Registrar cantidad'
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Subcomponente interno ────────────────────────────────────name───────────

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
