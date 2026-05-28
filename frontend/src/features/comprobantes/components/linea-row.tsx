import { Trash2 } from 'lucide-react';
import { type FieldErrors, useFormContext, useFormState } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { calcularMontoBob } from '../lib/calcular-monto-bob';
import { CuentaAutocomplete } from './cuenta-autocomplete';

interface LineaRowProps {
  index: number;
  onRemove: () => void;
  isOnlyRow: boolean;
  disabled?: boolean;
  'data-row-index'?: number;
}

/**
 * Fila individual del LineasEditor. Se integra con el FormProvider del padre
 * vía `useFormContext` + `useFormState({ name: 'lineas.${index}' })`.
 *
 * Usa `useFormState` aislado por nombre para minimizar re-renders: solo
 * esta fila se actualiza cuando cambian sus campos.
 *
 * `debitoBob`/`creditoBob` se calculan INLINE en cada render — NO viven en
 * el form. Esto evita que un `setValue('debitoBob', ...)` durante un keystroke
 * regenere el `field.id` del useFieldArray del padre, lo que provocaba que
 * React desmontara el input activo y se perdiera el foco. La conversión a
 * BOB se vuelve a hacer en el `onSubmit` del EditorForm antes de mandar al
 * backend (single source of truth: `debito` × `tipoCambio`).
 *
 * Cuando moneda cambia a BOB, el `tipoCambio` se fuerza a "1" desde el
 * `onValueChange` del Select (no desde un useEffect). Mismo motivo.
 */
export function LineaRow({
  index,
  onRemove,
  isOnlyRow,
  disabled = false,
  'data-row-index': dataRowIndex,
}: LineaRowProps): React.JSX.Element {
  const { register, setValue, watch, control } = useFormContext();

  // useFormState aislado por nombre de campo — evita re-renders en otras filas.
  const { errors } = useFormState({ control, name: `lineas.${index}` });

  const moneda = watch(`lineas.${index}.moneda`) as string;
  const debito = watch(`lineas.${index}.debito`) as string;
  const credito = watch(`lineas.${index}.credito`) as string;
  const tipoCambio = watch(`lineas.${index}.tipoCambio`) as string;

  // BOB derived — calculados inline, NO trackeados en el form.
  const debitoBob = calcularMontoBob(debito, tipoCambio);
  const creditoBob = calcularMontoBob(credito, tipoCambio);

  type LineasErrorsShape = { lineas?: Array<Record<string, { message?: string }>> };
  const lineaErrors = (errors as FieldErrors<LineasErrorsShape>).lineas?.[index];

  return (
    <tr
      className={cn('border-b border-border', disabled && 'opacity-60')}
      data-row-index={dataRowIndex}
    >
      {/* Cuenta */}
      <td className="p-1 min-w-[180px]">
        <CuentaAutocomplete
          value={watch(`lineas.${index}.cuentaId`) as string}
          onChange={(id) =>
            setValue(`lineas.${index}.cuentaId`, id, { shouldValidate: true })
          }
          disabled={disabled}
        />
        {lineaErrors?.cuentaId && (
          <p className="text-destructive text-xs mt-0.5">{lineaErrors.cuentaId.message}</p>
        )}
      </td>

      {/* Moneda */}
      <td className="p-1 w-24">
        <Select
          value={moneda}
          onValueChange={(val) => {
            setValue(`lineas.${index}.moneda`, val, { shouldValidate: true });
            // Cuando moneda pasa a BOB, forzar TC=1 en el mismo handler — evita
            // useEffect que dispararía setValue post-render y rompería el foco.
            if (val === 'BOB') {
              setValue(`lineas.${index}.tipoCambio`, '1', { shouldValidate: false });
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger aria-label="Moneda">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BOB">BOB</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>
      </td>

      {/* Debe */}
      <td className="p-1 w-28">
        <Input
          {...register(`lineas.${index}.debito`)}
          type="text"
          inputMode="decimal"
          aria-label="Debe"
          disabled={disabled}
          aria-invalid={!!lineaErrors?.debito}
          className={cn('font-mono text-right', lineaErrors?.debito && 'border-destructive')}
        />
        {lineaErrors?.debito && (
          <p className="text-destructive text-xs mt-0.5">{lineaErrors.debito.message}</p>
        )}
      </td>

      {/* Haber */}
      <td className="p-1 w-28">
        <Input
          {...register(`lineas.${index}.credito`)}
          type="text"
          inputMode="decimal"
          aria-label="Haber"
          disabled={disabled}
          aria-invalid={!!lineaErrors?.credito}
          className={cn('font-mono text-right', lineaErrors?.credito && 'border-destructive')}
        />
      </td>

      {/* Tipo de cambio — readonly si BOB */}
      <td className="p-1 w-24">
        <Input
          {...register(`lineas.${index}.tipoCambio`)}
          type="text"
          inputMode="decimal"
          aria-label="Tipo de cambio"
          readOnly={moneda === 'BOB'}
          disabled={disabled}
          className={cn(
            'font-mono text-right',
            moneda === 'BOB' && 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        />
      </td>

      {/* Debe BOB — derived inline, no register, no setValue. */}
      <td className="p-1 w-28">
        <Input
          value={debitoBob}
          readOnly
          aria-label="Debe BOB"
          disabled={disabled}
          className="font-mono text-right bg-muted text-muted-foreground cursor-not-allowed"
          tabIndex={-1}
        />
      </td>

      {/* Haber BOB — derived inline, no register, no setValue. */}
      <td className="p-1 w-28">
        <Input
          value={creditoBob}
          readOnly
          aria-label="Haber BOB"
          disabled={disabled}
          className="font-mono text-right bg-muted text-muted-foreground cursor-not-allowed"
          tabIndex={-1}
        />
      </td>

      {/* Glosa de línea */}
      <td className="p-1 min-w-[120px]">
        <Input
          {...register(`lineas.${index}.glosaLinea`)}
          type="text"
          aria-label="Glosa de línea"
          disabled={disabled}
          placeholder="Descripción…"
        />
      </td>

      {/* Botón eliminar */}
      <td className="p-1 w-10">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Eliminar fila"
          onClick={onRemove}
          disabled={disabled || isOnlyRow}
          className={cn(isOnlyRow && 'cursor-not-allowed opacity-40')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
