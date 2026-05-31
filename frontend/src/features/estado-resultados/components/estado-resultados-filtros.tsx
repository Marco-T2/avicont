import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import type { EstadoResultadosFiltroValues } from '../schemas/estado-resultados-filtro-schema';

// ============================================================
// Schema del formulario (shape plano para RHF). La validación de formato y
// orden del rango la resuelve handleSubmitInternal antes de emitir a onBuscar.
// ============================================================

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const formSchema = z.object({
  fechaDesde: z.string(),
  fechaHasta: z.string(),
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

/** Primer día del mes actual en formato YYYY-MM-DD (TZ local del navegador). */
function primerDiaDelMesISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

// ============================================================
// Props
// ============================================================

interface EstadoResultadosFiltrosProps {
  /** Callback cuando el usuario envía el formulario con filtros válidos. */
  onBuscar: (values: EstadoResultadosFiltroValues) => void;
  /** Indica si hay una consulta activa (para deshabilitar el botón). */
  isFetching?: boolean;
}

// ============================================================
// Componente
// ============================================================

/**
 * Panel de filtros del Estado de Resultados.
 *
 * Rango de flujo desde/hasta (REQ-ER-01, default: mes actual) + toggle
 * "Incluir anulados" (REQ-ER-04). Los selectores de período/gestión se omiten:
 * el backend los acepta, pero la UI expone solo el rango de fechas (decisión de
 * producto, consistente con el Balance General).
 */
export function EstadoResultadosFiltros({
  onBuscar,
  isFetching = false,
}: EstadoResultadosFiltrosProps): React.JSX.Element {
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
      fechaDesde: primerDiaDelMesISO(),
      fechaHasta: hoyISO(),
      incluirAnulados: false,
    },
  });

  const incluirAnulados = useWatch({ control, name: 'incluirAnulados' });

  function handleSubmitInternal(raw: FormValues): void {
    if (!FECHA_REGEX.test(raw.fechaDesde)) {
      setError('fechaDesde', { message: 'Seleccioná una fecha desde (YYYY-MM-DD)' });
      return;
    }
    if (!FECHA_REGEX.test(raw.fechaHasta)) {
      setError('fechaHasta', { message: 'Seleccioná una fecha hasta (YYYY-MM-DD)' });
      return;
    }
    if (raw.fechaDesde > raw.fechaHasta) {
      setError('fechaHasta', { message: 'La fecha hasta no puede ser anterior a la fecha desde' });
      return;
    }
    onBuscar({
      fechaDesde: raw.fechaDesde,
      fechaHasta: raw.fechaHasta,
      incluirAnulados: raw.incluirAnulados,
    });
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(handleSubmitInternal)(e)}
      className="flex flex-wrap items-end gap-3"
      noValidate
    >
      <div className="space-y-1">
        <Label htmlFor="resultados-desde" className="text-xs text-muted-foreground">
          Desde
        </Label>
        <Input
          id="resultados-desde"
          type="date"
          className="h-8 text-base md:text-sm w-44"
          aria-invalid={errors.fechaDesde !== undefined}
          {...register('fechaDesde')}
        />
        {errors.fechaDesde?.message !== undefined && (
          <p className="text-xs text-destructive">{errors.fechaDesde.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="resultados-hasta" className="text-xs text-muted-foreground">
          Hasta
        </Label>
        <Input
          id="resultados-hasta"
          type="date"
          className="h-8 text-base md:text-sm w-44"
          aria-invalid={errors.fechaHasta !== undefined}
          {...register('fechaHasta')}
        />
        {errors.fechaHasta?.message !== undefined && (
          <p className="text-xs text-destructive">{errors.fechaHasta.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2 pb-0.5">
        <Switch
          id="resultados-anulados"
          checked={incluirAnulados}
          onCheckedChange={(checked) => setValue('incluirAnulados', checked)}
        />
        <Label htmlFor="resultados-anulados" className="text-sm cursor-pointer">
          Incluir anulados
        </Label>
      </div>

      <Button type="submit" disabled={isFetching} size="sm" className="self-end">
        {isFetching ? 'Consultando…' : 'Consultar'}
      </Button>
    </form>
  );
}
