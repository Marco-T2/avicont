import { Trash2 } from 'lucide-react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Item } from '@/types/api';

import { calcularSubtotalPreview } from '../lib/calcular-total-venta';
import { ItemAutocomplete } from './item-autocomplete';

interface LineaVentaRowProps {
  index: number;
  onRemove: () => void;
  isOnlyRow: boolean;
  disabled?: boolean;
}

type LineaErrorShape = Record<string, { message?: string } | undefined> | undefined;

/**
 * Fila del editor de líneas de venta. Se integra con el FormProvider del
 * padre vía useFormContext (mismo patrón que LineaRow de comprobantes).
 *
 * Al elegir el ítem se precargan los snapshots (D-28): descripción = nombre
 * del ítem, precio = precioUnitarioSugerido, cantidad = cantidadPorDefecto
 * (solo si la cantidad está vacía). El usuario puede pisar los tres — lo que
 * viaja es lo PACTADO, no lo sugerido.
 */
export function LineaVentaRow({
  index,
  onRemove,
  isOnlyRow,
  disabled = false,
}: LineaVentaRowProps): React.JSX.Element {
  const { register, setValue, getValues, control } = useFormContext();

  // useFormState/useWatch aislados por nombre — solo esta fila re-renderiza
  // cuando cambian SUS campos.
  const { errors } = useFormState({ control, name: `lineas.${index}` });
  const lineaErrors = (errors.lineas as LineaErrorShape[] | undefined)?.[
    index
  ] as LineaErrorShape;

  const itemId = useWatch({ control, name: `lineas.${index}.itemId` }) as string;
  const cantidad = useWatch({ control, name: `lineas.${index}.cantidad` }) as string;
  const precioUnitario = useWatch({
    control,
    name: `lineas.${index}.precioUnitario`,
  }) as string;

  // Preview local — el subtotal autoritativo lo calcula el backend (REQ-VTA-03).
  const subtotalPreview = calcularSubtotalPreview(cantidad, precioUnitario);

  function handleSelectItem(item: Item): void {
    setValue(`lineas.${index}.itemId`, item.id, { shouldValidate: true });
    // Snapshots precargados y EDITABLES (D-28).
    setValue(`lineas.${index}.descripcion`, item.nombre, { shouldValidate: true });
    setValue(
      `lineas.${index}.precioUnitario`,
      item.precioUnitarioSugerido ?? '',
      { shouldValidate: true },
    );
    // La cantidad por defecto solo llena un campo vacío — no pisa lo que el
    // usuario ya tipeó al re-elegir el ítem.
    const cantidadActual = getValues(`lineas.${index}.cantidad`) as string;
    if (cantidadActual === '') {
      setValue(`lineas.${index}.cantidad`, item.cantidadPorDefecto, {
        shouldValidate: true,
      });
    }
  }

  return (
    <tr className={cn('border-b border-border', disabled && 'opacity-60')}>
      {/* Ítem */}
      <td className="p-1 align-top">
        <ItemAutocomplete
          value={itemId}
          onSelect={handleSelectItem}
          disabled={disabled}
        />
        {lineaErrors?.itemId && (
          <p className="text-destructive text-xs mt-0.5">
            {lineaErrors.itemId.message}
          </p>
        )}
      </td>

      {/* Descripción — snapshot editable por línea */}
      <td className="p-1 align-top">
        <Input
          {...register(`lineas.${index}.descripcion`)}
          type="text"
          aria-label="Descripción"
          disabled={disabled}
          placeholder="Descripción…"
          aria-invalid={!!lineaErrors?.descripcion}
          className={cn(
            'text-base md:text-sm',
            lineaErrors?.descripcion && 'border-destructive',
          )}
        />
        {lineaErrors?.descripcion && (
          <p className="text-destructive text-xs mt-0.5">
            {lineaErrors.descripcion.message}
          </p>
        )}
      </td>

      {/* Cantidad */}
      <td className="p-1 align-top">
        <Input
          {...register(`lineas.${index}.cantidad`)}
          type="text"
          inputMode="decimal"
          aria-label="Cantidad"
          disabled={disabled}
          aria-invalid={!!lineaErrors?.cantidad}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            'font-mono text-right text-base md:text-sm',
            lineaErrors?.cantidad && 'border-destructive',
          )}
        />
        {lineaErrors?.cantidad && (
          <p className="text-destructive text-xs mt-0.5">
            {lineaErrors.cantidad.message}
          </p>
        )}
      </td>

      {/* Precio unitario — PACTADO; 0 = ítem bonificado (REQ-VTA-04) */}
      <td className="p-1 align-top">
        <Input
          {...register(`lineas.${index}.precioUnitario`)}
          type="text"
          inputMode="decimal"
          aria-label="Precio unitario"
          disabled={disabled}
          aria-invalid={!!lineaErrors?.precioUnitario}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            'font-mono text-right text-base md:text-sm',
            lineaErrors?.precioUnitario && 'border-destructive',
          )}
        />
        {lineaErrors?.precioUnitario && (
          <p className="text-destructive text-xs mt-0.5">
            {lineaErrors.precioUnitario.message}
          </p>
        )}
      </td>

      {/* Subtotal — SOLO preview; el autoritativo lo persiste el backend */}
      <td className="p-1 pr-2 align-top text-right">
        <span className="font-mono tabular-nums text-sm leading-9 text-muted-foreground">
          {subtotalPreview ?? '—'}
        </span>
      </td>

      {/* Eliminar fila */}
      <td className="p-1 align-top">
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
