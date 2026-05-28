import { useFormContext } from 'react-hook-form';

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

interface ComprobanteCabeceraFormProps {
  /** Número correlativo — solo se muestra en mode=contabilizado (readonly). */
  numeroCorrelativo?: string | null;
  /** Cuando true, los campos se renderizan en modo solo lectura (contabilizado). */
  readonlyCabecera?: boolean;
}

/**
 * Sub-form de la cabecera del comprobante.
 * Usa `useFormContext` — NO recibe value/onChange propios.
 * El padre es responsable de envolver con <FormProvider>.
 *
 * Campos: tipo, fechaContable, glosa, tipoCambioReexpresion (opcional).
 * monedaPrincipal fue eliminado — el sistema lockea a BOB (spec §4.3 design).
 * En mode=contabilizado el número correlativo aparece readonly como campo extra.
 */
export function ComprobanteCabeceraForm({
  numeroCorrelativo,
  readonlyCabecera = false,
}: ComprobanteCabeceraFormProps): React.JSX.Element {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext();

  const tipo = watch('tipo') as string | undefined;

  return (
    <div className="space-y-4">
      {/* Número correlativo — solo visible cuando existe (contabilizado) */}
      {numeroCorrelativo !== undefined && numeroCorrelativo !== null && numeroCorrelativo !== '' && (
        <div className="space-y-1.5">
          <Label>Número</Label>
          <Input
            value={numeroCorrelativo}
            readOnly
            className="font-mono text-sm bg-muted text-muted-foreground cursor-not-allowed"
            aria-readonly="true"
          />
        </div>
      )}

      {/* Tipo */}
      <div className="space-y-1.5">
        <Label htmlFor="cabecera-tipo">Tipo</Label>
        <Select
          value={tipo ?? ''}
          onValueChange={(v) => setValue('tipo', v, { shouldValidate: true })}
          disabled={readonlyCabecera}
        >
          <SelectTrigger id="cabecera-tipo" aria-invalid={errors.tipo !== undefined} className="text-base md:text-sm">
            <SelectValue placeholder="Seleccioná un tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DIARIO">Diario</SelectItem>
            <SelectItem value="INGRESO">Ingreso</SelectItem>
            <SelectItem value="EGRESO">Egreso</SelectItem>
            <SelectItem value="TRASPASO">Traspaso</SelectItem>
            <SelectItem value="AJUSTE">Ajuste</SelectItem>
            <SelectItem value="APERTURA">Apertura</SelectItem>
            <SelectItem value="CIERRE">Cierre</SelectItem>
          </SelectContent>
        </Select>
        {errors.tipo !== undefined && (
          <p className="text-sm text-destructive">
            {errors.tipo.message as string}
          </p>
        )}
      </div>

      {/* Fecha contable */}
      <div className="space-y-1.5">
        <Label htmlFor="cabecera-fecha">Fecha contable</Label>
        <Input
          id="cabecera-fecha"
          type="date"
          className="text-base md:text-sm"
          aria-invalid={errors.fechaContable !== undefined}
          readOnly={readonlyCabecera}
          {...register('fechaContable')}
        />
        {errors.fechaContable !== undefined && (
          <p className="text-sm text-destructive">
            {errors.fechaContable.message as string}
          </p>
        )}
      </div>

      {/* Glosa */}
      <div className="space-y-1.5">
        <Label htmlFor="cabecera-glosa">Glosa</Label>
        <Textarea
          id="cabecera-glosa"
          placeholder="Descripción del comprobante (obligatoria)"
          className="text-base md:text-sm min-h-[72px] w-full max-w-full resize-y [field-sizing:fixed]"
          aria-invalid={errors.glosa !== undefined}
          readOnly={readonlyCabecera}
          {...register('glosa')}
        />
        {errors.glosa !== undefined && (
          <p className="text-sm text-destructive">
            {errors.glosa.message as string}
          </p>
        )}
      </div>

      {/* T/C re-expresión — campo de PRESENTACIÓN del encabezado.
          No afecta la contabilidad (débitos/créditos siguen siendo BOB).
          Permite ver/imprimir el comprobante expresado en otra moneda. */}
      <div className="space-y-1.5">
        <Label htmlFor="cabecera-tcr">T/C re-expresión (opcional)</Label>
        <Input
          id="cabecera-tcr"
          type="text"
          inputMode="decimal"
          placeholder="Ej: 6.96"
          className={cn(
            'text-base md:text-sm font-mono',
            (errors as { tipoCambioReexpresion?: unknown }).tipoCambioReexpresion !== undefined &&
              'border-destructive',
          )}
          aria-label="T/C re-expresión"
          aria-invalid={
            (errors as { tipoCambioReexpresion?: unknown }).tipoCambioReexpresion !== undefined
          }
          readOnly={readonlyCabecera}
          {...register('tipoCambioReexpresion')}
        />
        <p className="text-xs text-muted-foreground">
          Solo para presentación — no afecta débitos ni créditos en BOB.
        </p>
        {(errors as { tipoCambioReexpresion?: { message?: string } }).tipoCambioReexpresion !== undefined && (
          <p className="text-sm text-destructive">
            {(errors as { tipoCambioReexpresion?: { message?: string } }).tipoCambioReexpresion?.message}
          </p>
        )}
      </div>
    </div>
  );
}
