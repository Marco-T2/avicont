import { Trash2 } from 'lucide-react';
import { useFormContext, useFormState } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
 * Debe/Haber se cargan directamente en BOB (moneda lockada a BOB, tipoCambio=1).
 * El montoBob no se muestra por fila — sería un espejo idéntico del valor
 * cargado. La conversión a BOB para el payload se hace en el `onSubmit` del
 * EditorForm (single source of truth: `debito` × `tipoCambio`).
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

  // El cast a este shape plano evita el problema del tipo recursivo `FieldErrors`
  // de react-hook-form, que TS infiere como `FieldError` con `.message` que puede
  // ser nested y rompe el render.
  type LineaErrorShape = Record<string, { message?: string } | undefined> | undefined;
  const lineaErrors = (errors.lineas as LineaErrorShape[] | undefined)?.[index] as LineaErrorShape;

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

      {/* Moneda y T.C. ocultos — lockados a BOB/1; valor oculto en el form via LINEA_VACIA. */}

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
