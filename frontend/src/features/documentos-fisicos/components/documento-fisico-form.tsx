import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
// Cross-feature: tipos de documento para derivar esTributario del tipo seleccionado.
import { useTiposDocumentoFisico } from '@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico';
import type { ComprobanteAsociadoView } from '@/types/api';

import {
  buildFormSchema,
  DEFAULT_CREATE_VALUES,
  type DocumentoFisicoFormValues,
} from '../schemas/documento-fisico-form-schema';
import { ContactoCombobox } from './contacto-combobox';

interface DocumentoFisicoFormProps {
  mode: 'create' | 'edit';
  /** Comprobantes asociados al documento (solo relevante en mode=edit para D2). */
  comprobantesAsociados: ComprobanteAsociadoView[];
  /** Valores iniciales para mode=edit (o crear con defaults parciales). */
  initialValues?: DocumentoFisicoFormValues;
  onSubmit: (values: DocumentoFisicoFormValues) => void;
  isSubmitting: boolean;
}

/**
 * Form presentacional de creación/edición de documento físico.
 * D1: monto/moneda condicional según esTributario del tipo seleccionado.
 * D2: numero disabled si hay ≥1 comprobante CONTABILIZADO (solo en edit).
 * D7: numero uppercase en vivo + trim al blur.
 */
export function DocumentoFisicoForm({
  mode,
  comprobantesAsociados,
  initialValues,
  onSubmit,
  isSubmitting,
}: DocumentoFisicoFormProps): React.JSX.Element {
  // Cross-feature: tipos de documento para derivar esTributario.
  const { data: tiposData } = useTiposDocumentoFisico({ pageSize: 100, activo: true });
  const tipos = useMemo(() => tiposData?.items ?? [], [tiposData]);

  const defaultValues = initialValues ?? DEFAULT_CREATE_VALUES;

  // D2: numero inmutable si algún comprobante tiene estado CONTABILIZADO.
  const numeroEsInmutable =
    mode === 'edit' &&
    comprobantesAsociados.some((c) => c.estado === 'CONTABILIZADO');

  const form = useForm<DocumentoFisicoFormValues>({
    resolver: zodResolver(buildFormSchema(false)) as Resolver<DocumentoFisicoFormValues>,
    defaultValues,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const tipoIdSeleccionado = watch('tipoDocumentoFisicoId');
  const contactoId = watch('contactoId');

  // Deriva esTributario del tipo seleccionado.
  const tipoSeleccionado = useMemo(
    () => tipos.find((t) => t.id === tipoIdSeleccionado),
    [tipos, tipoIdSeleccionado],
  );
  const esTributario = tipoSeleccionado?.esTributario ?? false;

  // D1: react-hook-form no soporta resolver dinámico nativo. Usamos el resolver
  // inicial del useForm y re-validamos con el schema correcto en handleFormSubmit.
  // La limpieza de monto/moneda al pasar a no-tributario ocurre en el onChange
  // del select de tipo (más abajo) y como red de seguridad en el submit.
  const schema = useMemo(() => buildFormSchema(esTributario), [esTributario]);

  function handleFormSubmit(values: DocumentoFisicoFormValues): void {
    // Validar con el schema correcto (incluye condicionalidad esTributario).
    const result = schema.safeParse(values);
    if (!result.success) {
      // Setear errores manualmente. Zod v4: las issues están en `.issues` (no `.errors`).
      result.error.issues.forEach((e) => {
        const path = e.path[0];
        if (typeof path === 'string') {
          form.setError(path as keyof DocumentoFisicoFormValues, { message: e.message });
        }
      });
      return;
    }
    // Limpiar monto/moneda si no tributario antes de enviar.
    const payload = esTributario
      ? values
      : { ...values, monto: null, moneda: null };
    onSubmit(payload);
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(handleFormSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      {/* Tipo de documento */}
      <Field
        label="Tipo de documento"
        htmlFor="tipoDocumentoFisicoId"
        required
        error={errors.tipoDocumentoFisicoId?.message}
      >
        <select
          {...register('tipoDocumentoFisicoId')}
          id="tipoDocumentoFisicoId"
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1',
            'text-base shadow-xs outline-none md:text-sm',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          aria-invalid={errors.tipoDocumentoFisicoId !== undefined}
          onChange={(e) => {
            // Al cambiar tipo, limpiar monto/moneda si pasa a no-tributario.
            const nuevoTipo = tipos.find((t) => t.id === e.target.value);
            if (nuevoTipo !== undefined && !nuevoTipo.esTributario) {
              setValue('monto', null, { shouldValidate: false });
              setValue('moneda', null, { shouldValidate: false });
            }
            void register('tipoDocumentoFisicoId').onChange(e);
          }}
        >
          <option value="">Seleccioná un tipo…</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </Field>

      {/* Número — D7: uppercase en vivo + trim al blur */}
      <Field
        label="Número"
        htmlFor="numero"
        required
        error={errors.numero?.message}
      >
        <Input
          {...register('numero', {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              setValue('numero', e.target.value.toUpperCase(), { shouldValidate: false });
            },
            onBlur: () => {
              const current = form.getValues('numero');
              setValue('numero', current.trim(), { shouldValidate: false });
            },
          })}
          id="numero"
          placeholder="Ej: F-001, REC-2026-01"
          className="text-base md:text-sm"
          aria-invalid={errors.numero !== undefined}
          aria-label="Número"
          // D2: inmutable si hay CONTABILIZADO
          disabled={numeroEsInmutable}
        />
        {numeroEsInmutable ? (
          <p className="text-xs text-muted-foreground">
            El número no puede modificarse: el documento está en un comprobante contabilizado.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Solo letras mayúsculas, números, punto, guion y barra.
          </p>
        )}
      </Field>

      {/* Fecha de emisión */}
      <Field
        label="Fecha de emisión"
        htmlFor="fechaEmision"
        required
        error={errors.fechaEmision?.message}
      >
        <Input
          {...register('fechaEmision')}
          id="fechaEmision"
          type="date"
          className="text-base md:text-sm"
          aria-invalid={errors.fechaEmision !== undefined}
          aria-label="Fecha de emisión"
        />
      </Field>

      {/* D1: monto y moneda solo si esTributario */}
      {esTributario ? (
        <>
          <Field
            label="Monto"
            htmlFor="monto"
            required
            error={errors.monto?.message}
          >
            {/* §4.5: type="text" nunca type="number" */}
            <Input
              {...register('monto')}
              id="monto"
              type="text"
              placeholder="Ej: 1250.50"
              className="text-base md:text-sm"
              aria-invalid={errors.monto !== undefined}
              aria-label="Monto"
            />
          </Field>

          <Field
            label="Moneda"
            htmlFor="moneda"
            required
            error={errors.moneda?.message}
          >
            <select
              {...register('moneda')}
              id="moneda"
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1',
                'text-base shadow-xs outline-none md:text-sm',
                'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
              aria-invalid={errors.moneda !== undefined}
              aria-label="Moneda"
            >
              <option value="">Seleccioná una moneda…</option>
              <option value="BOB">BOB</option>
              <option value="USD">USD</option>
            </select>
          </Field>
        </>
      ) : null}

      {/* Contacto (opcional) */}
      <Field
        label="Contacto"
        htmlFor="contactoId"
        error={errors.contactoId?.message}
      >
        <ContactoCombobox
          value={contactoId ?? null}
          onSelect={(id) => setValue('contactoId', id, { shouldValidate: false })}
        />
      </Field>

      {/* Glosa — Anti-F-14: field-sizing:fixed dentro de Sheet */}
      <Field
        label="Glosa"
        htmlFor="glosa"
        error={errors.glosa?.message}
      >
        <Textarea
          {...register('glosa')}
          id="glosa"
          placeholder="Observación o descripción del documento…"
          className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[80px] text-base md:text-sm"
          aria-invalid={errors.glosa !== undefined}
        />
      </Field>

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
            'Crear documento'
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Subcomponente interno Field ─────────────────────────────────────────────

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
