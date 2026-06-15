import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
// Cross-feature: períodos del tenant para el selector de período fiscal.
import { usePeriodos } from '@/features/periodos-fiscales/hooks/use-periodos';
import { formatPeriodoCorto } from '@/lib/meses';

import type { BalanceComprobacionFiltroValues } from '../schemas/balance-comprobacion-filtro-schema';

// ============================================================
// Schema del formulario (shape plano — RHF no maneja bien discriminatedUnion).
// La exclusividad de modos (REQ-BC-01) la enforza handleSubmitInternal antes de
// construir el payload que se pasa a onBuscar.
// ============================================================

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const formSchema = z.object({
  modo: z.enum(['periodo', 'rango']),
  periodoFiscalId: z.string(),
  fechaDesde: z.string(),
  fechaHasta: z.string(),
  incluirAnulados: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

// ============================================================
// Props
// ============================================================

interface BalanceComprobacionFiltrosProps {
  /** Callback cuando el usuario envía el formulario con filtros válidos. */
  onBuscar: (values: BalanceComprobacionFiltroValues) => void;
  /** Indica si hay una búsqueda activa (para deshabilitar el botón). */
  isFetching?: boolean;
}

// ============================================================
// Componente
// ============================================================

/**
 * Panel de filtros del Balance de Comprobación.
 *
 * Modo "período fiscal": selector de período del tenant (default — es como el
 * contador corre el balance mes a mes). Modo "rango de fechas": dos inputs.
 * Toggle "Incluir anulados" (REQ-BC-08) disponible en ambos modos.
 *
 * REQ-BC-01: los modos son mutuamente excluyentes; el payload que se pasa a
 * onBuscar contiene exactamente uno.
 */
export function BalanceComprobacionFiltros({
  onBuscar,
  isFetching = false,
}: BalanceComprobacionFiltrosProps): React.JSX.Element {
  // Cross-feature: períodos del tenant para el selector.
  const { data: periodos } = usePeriodos();
  const periodosOrdenados = useMemo(
    () => [...(periodos ?? [])].sort((a, b) => b.year - a.year || b.month - a.month),
    [periodos],
  );

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
      modo: 'periodo',
      periodoFiscalId: '',
      fechaDesde: '',
      fechaHasta: '',
      incluirAnulados: false,
    },
  });

  const modo = useWatch({ control, name: 'modo' });
  const incluirAnulados = useWatch({ control, name: 'incluirAnulados' });

  function handleModoChange(nuevoModo: 'periodo' | 'rango'): void {
    setValue('modo', nuevoModo);
  }

  function handleSubmitInternal(raw: FormValues): void {
    if (raw.modo === 'periodo') {
      if (raw.periodoFiscalId === '') {
        setError('periodoFiscalId', { message: 'Seleccioná un período fiscal' });
        return;
      }
      onBuscar({
        modo: 'periodo',
        periodoFiscalId: raw.periodoFiscalId,
        incluirAnulados: raw.incluirAnulados,
      });
      return;
    }

    if (!FECHA_REGEX.test(raw.fechaDesde)) {
      setError('fechaDesde', { message: 'Formato de fecha inválido (YYYY-MM-DD)' });
      return;
    }
    if (!FECHA_REGEX.test(raw.fechaHasta)) {
      setError('fechaHasta', { message: 'Formato de fecha inválido (YYYY-MM-DD)' });
      return;
    }
    if (raw.fechaDesde > raw.fechaHasta) {
      setError('fechaHasta', {
        message: 'La fecha final no puede ser anterior a la fecha inicial',
      });
      return;
    }
    onBuscar({
      modo: 'rango',
      fechaDesde: raw.fechaDesde,
      fechaHasta: raw.fechaHasta,
      incluirAnulados: raw.incluirAnulados,
    });
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(handleSubmitInternal)(e)}
      className="space-y-4"
      noValidate
    >
      {/* Selector de modo */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={modo === 'periodo' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModoChange('periodo')}
        >
          Por período
        </Button>
        <Button
          type="button"
          variant={modo === 'rango' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModoChange('rango')}
        >
          Por rango de fechas
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Modo período fiscal */}
        {modo === 'periodo' && (
          <div className="space-y-1">
            <Label htmlFor="bc-periodo" className="text-xs text-muted-foreground">
              Período fiscal
            </Label>
            <Select
              onValueChange={(v) => setValue('periodoFiscalId', v, { shouldValidate: false })}
            >
              <SelectTrigger
                id="bc-periodo"
                className="h-8 text-sm w-48"
                aria-invalid={errors.periodoFiscalId !== undefined}
              >
                <SelectValue placeholder="Seleccionar período" />
              </SelectTrigger>
              <SelectContent>
                {periodosOrdenados.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatPeriodoCorto(p.year, p.month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.periodoFiscalId?.message !== undefined && (
              <p className="text-xs text-destructive">{errors.periodoFiscalId.message}</p>
            )}
          </div>
        )}

        {/* Modo rango de fechas */}
        {modo === 'rango' && (
          <>
            <div className="space-y-1">
              <Label htmlFor="bc-fecha-desde" className="text-xs text-muted-foreground">
                Desde
              </Label>
              <Input
                id="bc-fecha-desde"
                type="date"
                className="h-8 text-sm w-40 text-base md:text-sm"
                aria-invalid={errors.fechaDesde !== undefined}
                {...register('fechaDesde')}
              />
              {errors.fechaDesde?.message !== undefined && (
                <p className="text-xs text-destructive">{errors.fechaDesde.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="bc-fecha-hasta" className="text-xs text-muted-foreground">
                Hasta
              </Label>
              <Input
                id="bc-fecha-hasta"
                type="date"
                className="h-8 text-sm w-40 text-base md:text-sm"
                aria-invalid={errors.fechaHasta !== undefined}
                {...register('fechaHasta')}
              />
              {errors.fechaHasta?.message !== undefined && (
                <p className="text-xs text-destructive">{errors.fechaHasta.message}</p>
              )}
            </div>
          </>
        )}

        {/* Toggle incluir anulados */}
        <div className="flex items-center gap-2 pb-0.5">
          <Switch
            id="bc-anulados"
            checked={incluirAnulados}
            onCheckedChange={(checked) => setValue('incluirAnulados', checked)}
          />
          <Label htmlFor="bc-anulados" className="text-sm cursor-pointer">
            Incluir anulados
          </Label>
        </div>

        {/* Botón consultar */}
        <Button type="submit" disabled={isFetching} size="sm" className="self-end">
          {isFetching ? 'Consultando…' : 'Consultar'}
        </Button>
      </div>
    </form>
  );
}
