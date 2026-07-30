import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import type { Resolver } from 'react-hook-form';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// Cross-feature: reutilizamos CuentaAutocomplete de comprobantes (mismo
// precedente que libro-diario/libro-mayor) — filtra cuentas de detalle activas
// con pageSize 100 (tope del backend; si un tenant supera 100 cuentas de
// detalle, migrar a server-side search).
import { CuentaAutocomplete } from '@/features/comprobantes/components/cuenta-autocomplete';
import { cn } from '@/lib/utils';
import type { Item, TipoItem } from '@/types/api';

import { TIPO_ITEM_OPTIONS } from '../lib/build-items-params';
import { itemFormSchema, type ItemFormValues } from '../schemas/item-form-schema';

interface ItemFormProps {
  mode: 'create' | 'edit';
  initialData?: Item;
  onSubmit: (values: ItemFormValues) => void;
  isSubmitting: boolean;
}

const DEFAULT_CREATE_VALUES: ItemFormValues = {
  nombre: '',
  tipo: 'PRODUCTO',
  codigo: '',
  unidadMedida: '',
  precioUnitarioSugerido: '',
  cantidadPorDefecto: '1',
  cuentaIngresoId: '',
};

function mapItemToFormValues(item: Item): ItemFormValues {
  return {
    nombre: item.nombre,
    tipo: item.tipo,
    codigo: item.codigo ?? '',
    unidadMedida: item.unidadMedida ?? '',
    precioUnitarioSugerido: item.precioUnitarioSugerido ?? '',
    cantidadPorDefecto: item.cantidadPorDefecto,
    cuentaIngresoId: item.cuentaIngresoId ?? '',
  };
}

export function ItemForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: ItemFormProps): React.JSX.Element {
  const form = useForm<ItemFormValues>({
    // zodResolver infiere desde el input type del schema (campos con .default
    // son opcionales); ItemFormValues usa z.infer (output type). El cast
    // resuelve la discrepancia — mismo patrón que ContactoForm.
    resolver: zodResolver(itemFormSchema) as Resolver<ItemFormValues>,
    defaultValues:
      mode === 'edit' && initialData !== undefined
        ? mapItemToFormValues(initialData)
        : DEFAULT_CREATE_VALUES,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = form;

  const tipo = useWatch({ control, name: 'tipo' });
  const cuentaIngresoId = useWatch({ control, name: 'cuentaIngresoId' });

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre"
          htmlFor="nombre"
          required
          error={errors.nombre?.message}
        >
          <Input
            {...register('nombre')}
            id="nombre"
            placeholder="Pollo entero"
            className="text-base md:text-sm"
            aria-invalid={errors.nombre !== undefined}
          />
        </Field>

        <Field label="Tipo" required error={errors.tipo?.message}>
          <Select
            value={tipo}
            onValueChange={(v) => setValue('tipo', v as TipoItem, { shouldValidate: true })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPO_ITEM_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Código"
          htmlFor="codigo"
          error={errors.codigo?.message}
          hint="Opcional. Se guarda en mayúsculas y debe ser único en la organización."
        >
          <Input
            {...register('codigo')}
            id="codigo"
            placeholder="P-01"
            className="text-base md:text-sm font-mono"
            aria-invalid={errors.codigo !== undefined}
          />
        </Field>

        <Field
          label="Unidad de medida"
          htmlFor="unidadMedida"
          error={errors.unidadMedida?.message}
          hint="Texto libre: kg, unidad, caja, jaula…"
        >
          <Input
            {...register('unidadMedida')}
            id="unidadMedida"
            placeholder="kg"
            className="text-base md:text-sm"
            aria-invalid={errors.unidadMedida !== undefined}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Precio unitario sugerido"
          htmlFor="precioUnitarioSugerido"
          error={errors.precioUnitarioSugerido?.message}
          hint="Opcional, en Bs. Admite hasta 6 decimales (precio por kg)."
        >
          <Input
            {...register('precioUnitarioSugerido')}
            id="precioUnitarioSugerido"
            inputMode="decimal"
            placeholder="6.305"
            className="text-base md:text-sm font-mono"
            aria-invalid={errors.precioUnitarioSugerido !== undefined}
          />
        </Field>

        <Field
          label="Cantidad por defecto"
          htmlFor="cantidadPorDefecto"
          required
          error={errors.cantidadPorDefecto?.message}
          hint="Cantidad que se precarga al vender (ej. 12 para venta por caja)."
        >
          <Input
            {...register('cantidadPorDefecto')}
            id="cantidadPorDefecto"
            inputMode="decimal"
            placeholder="1"
            className="text-base md:text-sm font-mono"
            aria-invalid={errors.cantidadPorDefecto !== undefined}
          />
        </Field>
      </div>

      <Field
        label="Cuenta de ingreso"
        error={errors.cuentaIngresoId?.message}
        hint="Opcional. Vacía = se usa la cuenta de ventas configurada por la organización."
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <CuentaAutocomplete
              value={cuentaIngresoId}
              onChange={(id) => setValue('cuentaIngresoId', id, { shouldValidate: true })}
              placeholder="Usar cuenta de ventas por defecto"
            />
          </div>
          {cuentaIngresoId !== '' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Quitar cuenta de ingreso"
              onClick={() => setValue('cuentaIngresoId', '', { shouldValidate: true })}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </Field>

      <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {mode === 'create' ? 'Creando…' : 'Guardando…'}
            </>
          ) : mode === 'create' ? (
            'Crear ítem'
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Subcomponente interno de layout
// ------------------------------------------------------------

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
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
      ) : hint !== undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
