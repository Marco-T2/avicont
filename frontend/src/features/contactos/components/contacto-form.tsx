import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Contacto } from '@/types/api';

import {
  type ContactoFormValues,
  contactoFormSchema,
} from '../schemas/contacto-form-schema';

interface ContactoFormProps {
  mode: 'create' | 'edit';
  initialData?: Contacto;
  onSubmit: (values: ContactoFormValues) => void;
  isSubmitting: boolean;
}

const DEFAULT_CREATE_VALUES: ContactoFormValues = {
  razonSocial: '',
  nombreComercial: '',
  documento: '',
  email: '',
  telefono: '',
  direccion: '',
  esCliente: false,
  esProveedor: false,
};

function mapContactoToFormValues(c: Contacto): ContactoFormValues {
  return {
    razonSocial: c.razonSocial,
    nombreComercial: c.nombreComercial ?? '',
    documento: c.documento ?? '',
    email: c.email ?? '',
    telefono: c.telefono ?? '',
    direccion: c.direccion ?? '',
    esCliente: c.esCliente,
    esProveedor: c.esProveedor,
  };
}

export function ContactoForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: ContactoFormProps): React.JSX.Element {
  const form = useForm<ContactoFormValues>({
    // zodResolver infiere desde el input type del schema (campos con .default son opcionales).
    // ContactoFormValues usa z.infer (output type: todos requeridos). El cast resuelve la
    // discrepancia sin perder type safety en el submit: handleSubmit<ContactoFormValues> chequea.
    resolver: zodResolver(contactoFormSchema) as Resolver<ContactoFormValues>,
    defaultValues:
      mode === 'edit' && initialData !== undefined
        ? mapContactoToFormValues(initialData)
        : DEFAULT_CREATE_VALUES,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;

  // Error del refinement cross-field (esCliente || esProveedor).
  // Zod pone el error en el path 'esCliente'; lo extraemos para mostrarlo.
  const flagsError = errors.esCliente?.message;

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      <Field label="Razón social" htmlFor="razonSocial" required error={errors.razonSocial?.message}>
        <Input
          {...register('razonSocial')}
          id="razonSocial"
          placeholder="Empresa o persona"
          className="text-base md:text-sm"
          aria-invalid={errors.razonSocial !== undefined}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre comercial" htmlFor="nombreComercial" error={errors.nombreComercial?.message}>
          <Input
            {...register('nombreComercial')}
            id="nombreComercial"
            placeholder="Nombre que usa en el mercado"
            className="text-base md:text-sm"
            aria-invalid={errors.nombreComercial !== undefined}
          />
        </Field>

        <Field label="Documento" htmlFor="documento" error={errors.documento?.message}>
          <Input
            {...register('documento')}
            id="documento"
            placeholder="NIT / CI (opcional)"
            className="text-base md:text-sm"
            aria-invalid={errors.documento !== undefined}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            {...register('email')}
            id="email"
            type="email"
            placeholder="correo@ejemplo.com"
            className="text-base md:text-sm"
            aria-invalid={errors.email !== undefined}
          />
        </Field>

        <Field label="Teléfono" htmlFor="telefono" error={errors.telefono?.message}>
          <Input
            {...register('telefono')}
            id="telefono"
            placeholder="+591 7XXXXXXX"
            className="text-base md:text-sm"
            aria-invalid={errors.telefono !== undefined}
          />
        </Field>
      </div>

      <Field label="Dirección" htmlFor="direccion" error={errors.direccion?.message}>
        <Input
          {...register('direccion')}
          id="direccion"
          placeholder="Calle, número, ciudad"
          className="text-base md:text-sm"
          aria-invalid={errors.direccion !== undefined}
        />
      </Field>

      {/* Checkboxes: esCliente y esProveedor — al menos uno es obligatorio */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Tipo de contacto <span className="text-destructive">*</span>
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckRow
            id="esCliente"
            label="Es cliente"
            hint="El contacto compra productos o servicios de la empresa."
            checked={watch('esCliente')}
            onCheckedChange={(c) => setValue('esCliente', c, { shouldValidate: true })}
          />
          <CheckRow
            id="esProveedor"
            label="Es proveedor"
            hint="El contacto vende productos o servicios a la empresa."
            checked={watch('esProveedor')}
            onCheckedChange={(c) => setValue('esProveedor', c, { shouldValidate: true })}
          />
        </div>
        {flagsError !== undefined ? (
          <p className="text-xs text-destructive">{flagsError}</p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {mode === 'create' ? 'Creando…' : 'Guardando…'}
            </>
          ) : mode === 'create' ? (
            'Crear contacto'
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Subcomponentes internos (layout helpers)
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

interface CheckRowProps {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function CheckRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: CheckRowProps): React.JSX.Element {
  return (
    <div className="rounded-md border px-3 py-3 space-y-1.5">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <Label htmlFor={id} className="cursor-pointer">
            {label}
          </Label>
          {hint !== undefined ? (
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
