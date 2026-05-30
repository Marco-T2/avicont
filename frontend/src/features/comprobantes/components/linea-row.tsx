import { Trash2 } from 'lucide-react';
import { useFormContext, useFormState } from 'react-hook-form';

import { ContactoCombobox } from '@/components/shared/contacto-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Cuenta } from '@/types/api';

import { CuentaAutocomplete } from './cuenta-autocomplete';

interface LineaRowProps {
  index: number;
  /** Lista de cuentas disponibles — usada para leer `requiereContacto` de la cuenta elegida. */
  cuentas: Cuenta[];
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
  cuentas,
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

  // Resolver requiereContacto de la cuenta elegida en esta línea.
  // Derivado inline: design §Decisión 2 (validación blanda, no Zod required).
  const cuentaId = watch(`lineas.${index}.cuentaId`) as string;
  const contactoId = watch(`lineas.${index}.contactoId`) as string | undefined;
  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId);
  const requiereContacto = cuentaSeleccionada?.requiereContacto ?? false;
  // El aviso se muestra cuando la cuenta requiere contacto y no hay uno asignado.
  const contactoFaltante = requiereContacto && (contactoId === undefined || contactoId === '');

  return (
    <tr
      className={cn('border-b border-border', disabled && 'opacity-60')}
      data-row-index={dataRowIndex}
    >
      {/* Cuenta — ancho lo fija el colgroup del LineasEditor (table-fixed). */}
      <td className="p-1">
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
      <td className="p-1">
        <Input
          {...register(`lineas.${index}.debito`)}
          type="text"
          inputMode="decimal"
          aria-label="Debe"
          disabled={disabled}
          aria-invalid={!!lineaErrors?.debito}
          // Selecciona el contenido al foco: el "0" por defecto queda resaltado y
          // se reemplaza al tipear, en vez de quedar pegado (ej. "0" + "10" → "100").
          onFocus={(e) => e.currentTarget.select()}
          className={cn('font-mono text-right', lineaErrors?.debito && 'border-destructive')}
        />
        {lineaErrors?.debito && (
          <p className="text-destructive text-xs mt-0.5">{lineaErrors.debito.message}</p>
        )}
      </td>

      {/* Haber */}
      <td className="p-1">
        <Input
          {...register(`lineas.${index}.credito`)}
          type="text"
          inputMode="decimal"
          aria-label="Haber"
          disabled={disabled}
          aria-invalid={!!lineaErrors?.credito}
          // Ver nota en el input de Debe: selecciona el "0" al foco.
          onFocus={(e) => e.currentTarget.select()}
          className={cn('font-mono text-right', lineaErrors?.credito && 'border-destructive')}
        />
      </td>

      {/* Glosa de línea */}
      <td className="p-1">
        <Input
          {...register(`lineas.${index}.glosaLinea`)}
          type="text"
          aria-label="Glosa de línea"
          disabled={disabled}
          placeholder="Descripción…"
        />
      </td>

      {/* Contacto — siempre visible; aviso blando cuando requiereContacto && !contactoId. */}
      {/* design §Decisión 1 (columna siempre visible) y §Decisión 5 (patrón anti-foco). */}
      <td className="p-1">
        <ContactoCombobox
          value={contactoId ?? null}
          onSelect={(id) =>
            setValue(
              `lineas.${index}.contactoId`,
              id !== null ? id : undefined,
              // shouldValidate: false — validación es blanda (design §Decisión 2).
              { shouldValidate: false },
            )
          }
          disabled={disabled}
          aria-invalid={contactoFaltante}
          aria-label="Contacto"
        />
        {contactoFaltante && (
          <p className="text-amber-600 dark:text-amber-400 text-xs mt-0.5">
            Contacto requerido
          </p>
        )}
      </td>

      {/* Botón eliminar */}
      <td className="p-1">
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
