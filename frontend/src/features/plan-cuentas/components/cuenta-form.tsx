import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ClaseCuenta,
  type Cuenta,
  type CuentaTreeNode,
  Moneda,
  NaturalezaCuenta,
  SubClaseCuenta,
} from '@/types/api';

import { useCuentaTree } from '../hooks/use-cuenta-tree';
import {
  type CuentaFormValues,
  cuentaFormSchema,
  LABELS_CLASE,
  LABELS_MONEDA,
  LABELS_NATURALEZA,
  LABELS_SUBCLASE,
  SUBCLASES_POR_CLASE,
} from '../schemas/cuenta-form-schema';

interface CuentaFormProps {
  mode: 'create' | 'edit';
  initialData?: Cuenta;
  onSubmit: (values: CuentaFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const DEFAULT_CREATE_VALUES: CuentaFormValues = {
  codigoInterno: '',
  nombre: '',
  descripcion: '',
  claseCuenta: ClaseCuenta.ACTIVO,
  naturaleza: NaturalezaCuenta.DEUDORA,
  esDetalle: false,
  requiereContacto: false,
  esContraria: false,
  monedaFuncional: Moneda.BOB,
  permiteMultiMoneda: true,
};

// Naturaleza default por clase (ver backend/src/cuentas/domain/cuenta-validator.ts).
const NATURALEZA_DEFAULT: Record<ClaseCuenta, NaturalezaCuenta> = {
  ACTIVO: NaturalezaCuenta.DEUDORA,
  EGRESO: NaturalezaCuenta.DEUDORA,
  PASIVO: NaturalezaCuenta.ACREEDORA,
  PATRIMONIO: NaturalezaCuenta.ACREEDORA,
  INGRESO: NaturalezaCuenta.ACREEDORA,
};

function mapCuentaToFormValues(c: Cuenta): CuentaFormValues {
  return {
    codigoInterno: c.codigoInterno,
    nombre: c.nombre,
    descripcion: c.descripcion ?? '',
    claseCuenta: c.claseCuenta,
    ...(c.subClaseCuenta !== null ? { subClaseCuenta: c.subClaseCuenta } : {}),
    naturaleza: c.naturaleza,
    ...(c.parentId !== null ? { parentId: c.parentId } : {}),
    esDetalle: c.esDetalle,
    requiereContacto: c.requiereContacto,
    esContraria: c.esContraria,
    monedaFuncional: c.monedaFuncional,
    permiteMultiMoneda: c.permiteMultiMoneda,
  };
}

function flattenAgrupadores(nodes: CuentaTreeNode[]): CuentaTreeNode[] {
  const out: CuentaTreeNode[] = [];
  for (const node of nodes) {
    if (!node.esDetalle && node.activa) out.push(node);
    out.push(...flattenAgrupadores(node.hijas));
  }
  return out;
}

export function CuentaForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CuentaFormProps): React.JSX.Element {
  const { data: tree } = useCuentaTree();
  const agrupadores = useMemo(() => flattenAgrupadores(tree ?? []), [tree]);

  const form = useForm<CuentaFormValues>({
    resolver: zodResolver(cuentaFormSchema),
    defaultValues:
      mode === 'edit' && initialData !== undefined
        ? mapCuentaToFormValues(initialData)
        : DEFAULT_CREATE_VALUES,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const claseCuenta = watch('claseCuenta');
  const esContraria = watch('esContraria');
  const codigoInterno = watch('codigoInterno');
  const subClasesValidas = SUBCLASES_POR_CLASE[claseCuenta];

  // Al cambiar claseCuenta o esContraria (solo en create), auto-setea la
  // naturaleza coherente. En edit la naturaleza es inmutable (estructural).
  useEffect(() => {
    if (mode === 'edit') return;
    const defaultN = NATURALEZA_DEFAULT[claseCuenta];
    const expected =
      esContraria === true
        ? defaultN === NaturalezaCuenta.DEUDORA
          ? NaturalezaCuenta.ACREEDORA
          : NaturalezaCuenta.DEUDORA
        : defaultN;
    setValue('naturaleza', expected, { shouldValidate: false });
  }, [mode, claseCuenta, esContraria, setValue]);

  // Al cambiar claseCuenta, reset de subClaseCuenta si no pertenece a la nueva.
  useEffect(() => {
    if (mode === 'edit') return;
    const current = form.getValues('subClaseCuenta');
    if (current !== undefined && !subClasesValidas.includes(current)) {
      setValue('subClaseCuenta', undefined, { shouldValidate: false });
    }
  }, [mode, claseCuenta, subClasesValidas, form, setValue]);

  // Derivar nivel del código interno para hint visual.
  const nivelDerivado =
    codigoInterno.length > 0 ? codigoInterno.split('.').length : null;

  const structuralDisabled = mode === 'edit';

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-5"
      noValidate
    >
      {/* Row 1-de-3: código + nombre (el nombre ocupa 2 cols para tener espacio). */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Código interno"
          required
          error={errors.codigoInterno?.message}
          hint={
            nivelDerivado !== null ? `Nivel derivado: ${nivelDerivado}` : undefined
          }
          disabledHint={
            structuralDisabled
              ? 'Inmutable post-creación (identificador único).'
              : undefined
          }
        >
          <Input
            {...register('codigoInterno')}
            placeholder="1.1.1.001"
            disabled={structuralDisabled}
            aria-invalid={errors.codigoInterno !== undefined}
          />
        </Field>

        <Field
          label="Nombre"
          required
          error={errors.nombre?.message}
          className="sm:col-span-2"
        >
          <Input
            {...register('nombre')}
            placeholder="CAJA MONEDA NACIONAL"
            aria-invalid={errors.nombre !== undefined}
          />
        </Field>
      </div>

      <Field label="Descripción" error={errors.descripcion?.message}>
        <Textarea
          {...register('descripcion')}
          rows={2}
          placeholder="Opcional — notas para auditoría o uso."
        />
      </Field>

      <Row>
        <Field
          label="Clase"
          required
          error={errors.claseCuenta?.message}
          disabledHint={structuralDisabled ? 'Inmutable post-creación.' : undefined}
        >
          <Select
            value={watch('claseCuenta')}
            onValueChange={(v) => setValue('claseCuenta', v as ClaseCuenta)}
            disabled={structuralDisabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LABELS_CLASE) as ClaseCuenta[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {LABELS_CLASE[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Subclase (NIIF)"
          error={errors.subClaseCuenta?.message}
          hint="Opcional solo en nivel 1."
          disabledHint={structuralDisabled ? 'Inmutable post-creación.' : undefined}
        >
          <Select
            value={watch('subClaseCuenta') ?? '__none__'}
            onValueChange={(v) =>
              setValue(
                'subClaseCuenta',
                v === '__none__' ? undefined : (v as SubClaseCuenta),
              )
            }
            disabled={structuralDisabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="— ninguna —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— ninguna —</SelectItem>
              {subClasesValidas.map((sc) => (
                <SelectItem key={sc} value={sc}>
                  {LABELS_SUBCLASE[sc]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Row>

      {/* Naturaleza y Cuenta padre van FULL-WIDTH (no en grid) para evitar
          superposición con los hints/errores y dar aire al Select de
          Cuenta padre que muestra código + nombre completo del agrupador. */}
      <Field
        label="Naturaleza"
        required
        error={errors.naturaleza?.message}
        hint={
          mode === 'create'
            ? 'Se ajusta automáticamente según clase + "es contraria".'
            : undefined
        }
        disabledHint={structuralDisabled ? 'Inmutable post-creación.' : undefined}
      >
        <Select
          value={watch('naturaleza')}
          onValueChange={(v) => setValue('naturaleza', v as NaturalezaCuenta)}
          disabled={structuralDisabled}
        >
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LABELS_NATURALEZA) as NaturalezaCuenta[]).map((n) => (
              <SelectItem key={n} value={n}>
                {LABELS_NATURALEZA[n]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Cuenta padre"
        error={errors.parentId?.message}
        hint="Agrupador del mismo tenant. Dejar vacío para una raíz (nivel 1)."
        disabledHint={structuralDisabled ? 'Inmutable post-creación.' : undefined}
      >
        <Select
          value={watch('parentId') ?? '__none__'}
          onValueChange={(v) =>
            setValue('parentId', v === '__none__' ? undefined : v)
          }
          disabled={structuralDisabled}
        >
          <SelectTrigger className="min-w-0 [&>span]:truncate">
            <SelectValue placeholder="— sin padre (raíz) —" />
          </SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-2rem)]">
            <SelectItem value="__none__">— sin padre (raíz) —</SelectItem>
            {agrupadores.map((ag) => (
              <SelectItem key={ag.id} value={ag.id}>
                <span className="font-mono text-xs mr-2 text-muted-foreground">
                  {ag.codigoInterno}
                </span>
                <span>{ag.nombre}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <CheckRow
          id="esDetalle"
          label="Es cuenta de detalle (hoja)"
          hint="Si false, es agrupador — no acepta asientos directos."
          checked={watch('esDetalle')}
          onCheckedChange={(c) => setValue('esDetalle', c)}
          disabled={structuralDisabled}
          disabledHint={structuralDisabled ? 'Inmutable post-creación.' : undefined}
        />
        <CheckRow
          id="esContraria"
          label="Es cuenta contraria"
          hint="Naturaleza opuesta a la default (ej. Depreciación Acumulada)."
          checked={watch('esContraria')}
          onCheckedChange={(c) => setValue('esContraria', c)}
          disabled={structuralDisabled}
          disabledHint={structuralDisabled ? 'Inmutable post-creación.' : undefined}
        />
        <CheckRow
          id="requiereContacto"
          label="Requiere contacto"
          hint="Los asientos contra esta cuenta deben tener contactoId."
          checked={watch('requiereContacto')}
          onCheckedChange={(c) => setValue('requiereContacto', c)}
        />
        <CheckRow
          id="permiteMultiMoneda"
          label="Permite multi-moneda"
          hint="Si false, acepta solo asientos en la moneda funcional."
          checked={watch('permiteMultiMoneda')}
          onCheckedChange={(c) => setValue('permiteMultiMoneda', c)}
        />
      </div>

      <Field label="Moneda funcional" error={errors.monedaFuncional?.message}>
        <Select
          value={watch('monedaFuncional')}
          onValueChange={(v) => setValue('monedaFuncional', v as Moneda)}
        >
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LABELS_MONEDA) as Moneda[]).map((m) => (
              <SelectItem key={m} value={m}>
                {LABELS_MONEDA[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {mode === 'create' ? 'Creando…' : 'Guardando…'}
            </>
          ) : mode === 'create' ? (
            'Crear cuenta'
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

function Row({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="grid gap-4 md:grid-cols-3">{children}</div>;
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  disabledHint?: string | undefined;
  className?: string;
  children: React.ReactNode;
}

function Field({
  label,
  required,
  error,
  hint,
  disabledHint,
  className,
  children,
}: FieldProps): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="flex items-center gap-1">
        {label}
        {required === true ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error !== undefined ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint !== undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {disabledHint !== undefined ? (
        <p className="text-xs italic text-muted-foreground/80">{disabledHint}</p>
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
  disabled?: boolean;
  disabledHint?: string | undefined;
}

function CheckRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  disabledHint,
}: CheckRowProps): React.JSX.Element {
  return (
    <div className="rounded-md border px-3 py-3 space-y-1.5">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          disabled={disabled}
          className="mt-0.5"
        />
        <div className="flex-1">
          <Label htmlFor={id} className="cursor-pointer">
            {label}
          </Label>
          {hint !== undefined ? (
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
          ) : null}
          {disabledHint !== undefined ? (
            <p className="text-xs italic text-muted-foreground/80 mt-1">
              {disabledHint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
