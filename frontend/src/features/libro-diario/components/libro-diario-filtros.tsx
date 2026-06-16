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
// Cross-feature: reutilizamos CuentaAutocomplete de comprobantes — filtra
// cuentas de detalle activas con pageSize 100.
import { CuentaAutocomplete } from '@/features/comprobantes/components/cuenta-autocomplete';
// Cross-feature: períodos del tenant para el selector de período fiscal.
import { usePeriodos } from '@/features/periodos-fiscales/hooks/use-periodos';
import { hoyEnLaPazISO, primerDiaDelAnioISO } from '@/lib/fecha-actual';
import { formatPeriodoCorto } from '@/lib/meses';

import type { LibroDiarioFiltroValues } from '../schemas/libro-diario-filtro-schema';

// ============================================================
// Schema del formulario (shape plano — RHF no soporta bien discriminatedUnion)
// La validación de la regla de negocio "modo exclusivo" la hace onBuscar antes
// de pasar al schema del libro-diario; el formulario plano es solo para captura.
// ============================================================

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Schema plano para RHF — captura todos los campos posibles.
// La lógica de qué rama aplica la resuelve handleBuscar según el modo activo.
const formSchema = z.object({
  modo: z.enum(['periodo', 'rango']),
  periodoFiscalId: z.string(),
  fechaDesde: z.string(),
  fechaHasta: z.string(),
  incluirAnulados: z.boolean(),
  cuentaId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

// ============================================================
// Props
// ============================================================

interface LibroDiarioFiltrosProps {
  /** Callback cuando el usuario envía el formulario con filtros válidos. */
  onBuscar: (values: LibroDiarioFiltroValues) => void;
  /** Indica si hay una búsqueda activa (para deshabilitar el botón). */
  isFetching?: boolean;
}

// ============================================================
// Componente
// ============================================================

/**
 * Panel de filtros del Libro Diario.
 *
 * Modo "período fiscal": selector de período del tenant (default).
 * Modo "rango de fechas": dos inputs YYYY-MM-DD.
 * Toggle "Incluir anulados" disponible en ambos modos.
 *
 * REQ-LD-01: la exclusividad de modos se enforza al construir el payload
 * que se pasa a onBuscar. El formulario usa un schema plano para que RHF
 * maneje el estado sin errores de tipos con discriminatedUnion.
 */
export function LibroDiarioFiltros({
  onBuscar,
  isFetching = false,
}: LibroDiarioFiltrosProps): React.JSX.Element {
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
      fechaDesde: primerDiaDelAnioISO(),
      fechaHasta: hoyEnLaPazISO(),
      incluirAnulados: false,
      cuentaId: '',
    },
  });

  const modo = useWatch({ control, name: 'modo' });
  const incluirAnulados = useWatch({ control, name: 'incluirAnulados' });
  const cuentaId = useWatch({ control, name: 'cuentaId' });

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
        ...(raw.cuentaId !== '' ? { cuentaId: raw.cuentaId } : {}),
      });
    } else {
      // Validar formato y orden de fechas
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
        ...(raw.cuentaId !== '' ? { cuentaId: raw.cuentaId } : {}),
      });
    }
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
            <Label htmlFor="libro-periodo" className="text-xs text-muted-foreground">
              Período fiscal
            </Label>
            <Select
              onValueChange={(v) =>
                setValue('periodoFiscalId', v, { shouldValidate: false })
              }
            >
              <SelectTrigger
                id="libro-periodo"
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
              <Label htmlFor="libro-fecha-desde" className="text-xs text-muted-foreground">
                Desde
              </Label>
              <Input
                id="libro-fecha-desde"
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
              <Label htmlFor="libro-fecha-hasta" className="text-xs text-muted-foreground">
                Hasta
              </Label>
              <Input
                id="libro-fecha-hasta"
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

        {/* Filtro por cuenta (opcional) */}
        <div className="space-y-1">
          <Label htmlFor="libro-cuenta" className="text-xs text-muted-foreground">
            Cuenta (opcional)
          </Label>
          {/* Cross-feature: reutilizamos CuentaAutocomplete de comprobantes — filtra
              cuentas de detalle activas con pageSize 100. Ver frontend CLAUDE.md §14.6. */}
          <div className="w-56">
            <CuentaAutocomplete
              value={cuentaId}
              onChange={(id) => setValue('cuentaId', id)}
              placeholder="Todas las cuentas"
            />
          </div>
        </div>

        {/* Toggle incluir anulados */}
        <div className="flex items-center gap-2 pb-0.5">
          <Switch
            id="libro-anulados"
            checked={incluirAnulados}
            onCheckedChange={(checked) => setValue('incluirAnulados', checked)}
          />
          <Label htmlFor="libro-anulados" className="text-sm cursor-pointer">
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
