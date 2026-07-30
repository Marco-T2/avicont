import type { UseFormReturn } from 'react-hook-form';
import { useWatch } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Cross-feature: reuso del combobox de cuentas de detalle activas (mismo
// precedente que features/items). El backend valida la elegibilidad de la
// cuenta destino (efectivo/equivalentes, REQ-CXC-02) y responde 422
// COBRO_CUENTA_DESTINO_NO_ELEGIBLE si no corresponde — acá no se re-filtra.
import { CuentaAutocomplete } from '@/features/comprobantes/components/cuenta-autocomplete';

import type { CobroFormValues } from '../schemas/cobro-form-schema';
import { ContactoCombobox } from './contacto-combobox';

interface CobroCabeceraFieldsProps {
  form: UseFormReturn<CobroFormValues>;
  disabled?: boolean;
  /** El alta resetea el reparto FIFO cuando cambia el cliente o el monto. */
  onContactoSelect?: (id: string) => void;
  onMontoInput?: () => void;
}

/**
 * Campos de cabecera del cobro, compartidos entre alta y edición:
 * cliente, fecha contable, monto, cuenta destino y glosa.
 */
export function CobroCabeceraFields({
  form,
  disabled = false,
  onContactoSelect,
  onMontoInput,
}: CobroCabeceraFieldsProps): React.JSX.Element {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;

  const contactoId = useWatch({ control, name: 'contactoId' });
  const cuentaDestinoId = useWatch({ control, name: 'cuentaDestinoId' });

  const montoRegister = register('monto');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            Cliente <span className="text-destructive">*</span>
          </Label>
          <ContactoCombobox
            value={contactoId}
            onChange={(id) => {
              setValue('contactoId', id, { shouldValidate: true, shouldDirty: true });
              onContactoSelect?.(id);
            }}
            disabled={disabled}
          />
          {errors.contactoId !== undefined && (
            <p className="text-xs text-destructive" role="alert">
              {errors.contactoId.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cobro-fecha">
            Fecha contable <span className="text-destructive">*</span>
          </Label>
          <Input
            {...register('fechaContable')}
            id="cobro-fecha"
            type="date"
            disabled={disabled}
            className="text-base md:text-sm"
            aria-invalid={errors.fechaContable !== undefined}
          />
          {errors.fechaContable !== undefined && (
            <p className="text-xs text-destructive" role="alert">
              {errors.fechaContable.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cobro-monto">
            Monto (Bs) <span className="text-destructive">*</span>
          </Label>
          {/* §4.5: input de texto → string Decimal(18,2) sin tocar. */}
          <Input
            {...montoRegister}
            onChange={(e) => {
              void montoRegister.onChange(e);
              onMontoInput?.();
            }}
            id="cobro-monto"
            inputMode="decimal"
            placeholder="600.00"
            disabled={disabled}
            className="text-base md:text-sm font-mono"
            aria-invalid={errors.monto !== undefined}
          />
          {errors.monto !== undefined && (
            <p className="text-xs text-destructive" role="alert">
              {errors.monto.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            Cuenta destino <span className="text-destructive">*</span>
          </Label>
          <CuentaAutocomplete
            value={cuentaDestinoId}
            onChange={(id) =>
              setValue('cuentaDestinoId', id, { shouldValidate: true, shouldDirty: true })
            }
            disabled={disabled}
            placeholder="Caja General…"
          />
          {errors.cuentaDestinoId !== undefined ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.cuentaDestinoId.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Cuenta de efectivo o equivalentes donde entra la plata (bajo 1.1.1 o
              marcada como EFECTIVO).
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cobro-glosa">
          Glosa <span className="text-destructive">*</span>
        </Label>
        <Textarea
          {...register('glosa')}
          id="cobro-glosa"
          placeholder="Cobro en efectivo — factura 12"
          disabled={disabled}
          // Anti-F-14: field-sizing fixed para que una línea larga no empuje el layout.
          className="text-base md:text-sm min-h-[72px] w-full max-w-full resize-y [field-sizing:fixed]"
          aria-invalid={errors.glosa !== undefined}
        />
        {errors.glosa !== undefined && (
          <p className="text-xs text-destructive" role="alert">
            {errors.glosa.message}
          </p>
        )}
      </div>
    </div>
  );
}
