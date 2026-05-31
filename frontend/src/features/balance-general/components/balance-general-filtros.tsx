import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import type { BalanceGeneralFiltroValues } from '../schemas/balance-general-filtro-schema';

// ============================================================
// Schema del formulario (shape plano para RHF). La validación de formato de
// fecha la resuelve handleSubmitInternal antes de pasar el payload a onBuscar.
// ============================================================

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const formSchema = z.object({
  fecha: z.string(),
  incluirAnulados: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

/** Fecha de hoy en formato YYYY-MM-DD (TZ local del navegador). */
function hoyISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================
// Props
// ============================================================

interface BalanceGeneralFiltrosProps {
  /** Callback cuando el usuario envía el formulario con filtros válidos. */
  onBuscar: (values: BalanceGeneralFiltroValues) => void;
  /** Indica si hay una consulta activa (para deshabilitar el botón). */
  isFetching?: boolean;
}

// ============================================================
// Componente
// ============================================================

/**
 * Panel de filtros del Balance General.
 *
 * Fecha de corte (REQ-BG-01, default hoy) + toggle "Incluir anulados"
 * (REQ-BG-10). El selector de gestión se omite: el backend infiere la gestión
 * que contiene la fecha de corte.
 */
export function BalanceGeneralFiltros({
  onBuscar,
  isFetching = false,
}: BalanceGeneralFiltrosProps): React.JSX.Element {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fecha: hoyISO(),
      incluirAnulados: false,
    },
  });

  const incluirAnulados = useWatch({ control, name: 'incluirAnulados' });

  function handleSubmitInternal(raw: FormValues): void {
    if (!FECHA_REGEX.test(raw.fecha)) {
      setError('fecha', { message: 'Seleccioná una fecha de corte (YYYY-MM-DD)' });
      return;
    }
    onBuscar({ fecha: raw.fecha, incluirAnulados: raw.incluirAnulados });
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(handleSubmitInternal)(e)}
      className="flex flex-wrap items-end gap-3"
      noValidate
    >
      <div className="space-y-1">
        <Label htmlFor="balance-fecha" className="text-xs text-muted-foreground">
          Fecha de corte
        </Label>
        <Input
          id="balance-fecha"
          type="date"
          className="h-8 text-base md:text-sm w-44"
          aria-invalid={errors.fecha !== undefined}
          {...register('fecha')}
        />
        {errors.fecha?.message !== undefined && (
          <p className="text-xs text-destructive">{errors.fecha.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2 pb-0.5">
        <Switch
          id="balance-anulados"
          checked={incluirAnulados}
          onCheckedChange={(checked) => setValue('incluirAnulados', checked)}
        />
        <Label htmlFor="balance-anulados" className="text-sm cursor-pointer">
          Incluir anulados
        </Label>
      </div>

      <Button type="submit" disabled={isFetching} size="sm" className="self-end">
        {isFetching ? 'Consultando…' : 'Consultar'}
      </Button>
    </form>
  );
}
