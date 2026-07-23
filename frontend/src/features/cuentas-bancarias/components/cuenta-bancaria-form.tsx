import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { Resolver } from 'react-hook-form';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CuentaBancaria, Moneda } from '@/types/api';

import { PERFIL_EXTRACTO_OPTIONS } from '../lib/perfil-extracto-options';
import {
  cuentaBancariaFormSchema,
  DEFAULT_CREATE_VALUES,
  mapCuentaBancariaToFormValues,
  type CuentaBancariaFormValues,
} from '../schemas/cuenta-bancaria-form-schema';

import { CuentaSelector } from './cuenta-selector';

interface CuentaBancariaFormProps {
  mode: 'create' | 'edit';
  initialData?: CuentaBancaria;
  onSubmit: (values: CuentaBancariaFormValues) => void;
  isSubmitting: boolean;
}

export function CuentaBancariaForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: CuentaBancariaFormProps): React.JSX.Element {
  const form = useForm<CuentaBancariaFormValues>({
    // zodResolver infiere desde el input type; el cast resuelve la discrepancia
    // entre input (campos con .default opcionales) y output (todos requeridos).
    resolver: zodResolver(cuentaBancariaFormSchema) as Resolver<CuentaBancariaFormValues>,
    defaultValues:
      mode === 'edit' && initialData !== undefined
        ? mapCuentaBancariaToFormValues(initialData)
        : DEFAULT_CREATE_VALUES,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = form;

  const cuentaId = useWatch({ control, name: 'cuentaId' });
  const perfilExtracto = useWatch({ control, name: 'perfilExtracto' });
  const moneda = useWatch({ control, name: 'moneda' });
  const activa = useWatch({ control, name: 'activa' });

  function handleFormSubmit(values: CuentaBancariaFormValues): void {
    onSubmit({
      ...values,
      // Input vacío ('') → null (backend acepta numeroCuenta null/omitido).
      numeroCuenta:
        values.numeroCuenta !== null && values.numeroCuenta.trim() === ''
          ? null
          : values.numeroCuenta,
    });
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(handleFormSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      <Field
        label="Cuenta del plan"
        required
        error={errors.cuentaId?.message}
        hint={mode === 'edit' ? undefined : 'esDetalle=true y activa=true. Elegila vos — no se adivina.'}
        disabledHint={mode === 'edit' ? 'Inmutable post-creación.' : undefined}
      >
        <CuentaSelector
          value={cuentaId}
          onChange={(id) => setValue('cuentaId', id, { shouldValidate: true, shouldDirty: true })}
          disabled={mode === 'edit'}
        />
      </Field>

      <Field label="Alias" htmlFor="alias" required error={errors.alias?.message}>
        <Input
          {...register('alias')}
          id="alias"
          placeholder="Cuenta corriente BancoSol"
          className="text-base md:text-sm"
          aria-invalid={errors.alias !== undefined}
        />
      </Field>

      <Field
        label="Perfil de extracto"
        required
        error={errors.perfilExtracto?.message}
        disabledHint={mode === 'edit' ? 'Inmutable post-creación.' : undefined}
      >
        <Select
          value={perfilExtracto}
          onValueChange={(v) =>
            setValue('perfilExtracto', v as CuentaBancariaFormValues['perfilExtracto'], {
              shouldDirty: true,
            })
          }
          disabled={mode === 'edit'}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFIL_EXTRACTO_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Moneda"
        required
        error={errors.moneda?.message}
        hint="Debe coincidir con la moneda funcional si la cuenta del plan no permite multi-moneda."
      >
        <Select
          value={moneda}
          onValueChange={(v) => setValue('moneda', v as Moneda, { shouldDirty: true })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BOB">BOB — Bolivianos</SelectItem>
            <SelectItem value="USD">USD — Dólares</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Número de cuenta"
        htmlFor="numeroCuenta"
        error={errors.numeroCuenta?.message}
        hint="Opcional — se captura y confirma en la primera importación de extracto."
      >
        <Input
          {...register('numeroCuenta')}
          id="numeroCuenta"
          placeholder="1191959-000-001"
          className="text-base md:text-sm"
          aria-invalid={errors.numeroCuenta !== undefined}
        />
      </Field>

      {mode === 'edit' ? (
        <div className="space-y-1.5">
          <div className="flex items-start gap-3 rounded-md border px-3 py-3">
            <Checkbox
              id="activa"
              checked={activa}
              onCheckedChange={(v) => setValue('activa', v === true, { shouldDirty: true })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="activa" className="cursor-pointer">
                Activa
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Las cuentas bancarias inactivas no aparecen para importar extractos.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando…
            </>
          ) : mode === 'create' ? (
            'Crear cuenta bancaria'
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
  hint?: string | undefined;
  disabledHint?: string | undefined;
  className?: string;
  children: React.ReactNode;
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  disabledHint,
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
      {disabledHint !== undefined ? (
        <p className="text-xs text-muted-foreground">{disabledHint}</p>
      ) : hint !== undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error !== undefined ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
