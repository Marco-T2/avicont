import { useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { calcularRangoGestionISO } from '@/features/periodos-fiscales/lib/calcular-rango-gestion-iso';
// Cross-feature: catálogo de gestiones del tenant para el selector de preset.
import { useGestiones } from '@/features/periodos-fiscales/hooks/use-gestiones';
import type { Gestion } from '@/types/api';
import {
  primerDiaDelMesISO,
  rangoMesAnteriorISO,
  ultimoDiaDelMesISO,
} from '@/lib/fecha-actual';
import { cn } from '@/lib/utils';

// ============================================================
// Contrato de salida — SIEMPRE un rango de fechas.
// Elimina el XOR { modo:'periodo' | 'rango' } previo.
// Los 6 features consumidores (libro-diario, libro-mayor,
// balance-comprobacion, hoja-trabajo, flujo-efectivo,
// evolucion-patrimonio) se actualizan en slices 4-5.
// ============================================================

export interface RangoFechas {
  fechaDesde: string; // YYYY-MM-DD
  fechaHasta: string; // YYYY-MM-DD
}

type Preset =
  | 'esta-gestion'
  | 'gestion-anterior'
  | 'este-mes'
  | 'mes-anterior'
  | 'personalizado';

const LABELS_PRESET: Record<Preset, string> = {
  'esta-gestion': 'Esta gestión',
  'gestion-anterior': 'Gestión anterior',
  'este-mes': 'Este mes',
  'mes-anterior': 'Mes anterior',
  'personalizado': 'Personalizado',
};

interface PeriodoGestionFiltroProps {
  onChange: (rango: RangoFechas) => void;
  /** Mensaje de validación externo (lo provee el form que envuelve al componente). */
  error?: string;
  className?: string;
}

// ============================================================
// Función pura de resolución de preset → RangoFechas | null
// ============================================================

function resolverPreset(
  preset: Preset,
  gestionEfectiva: Gestion | undefined,
  gestionAnterior: Gestion | undefined,
  fechaDesde: string,
  fechaHasta: string,
): RangoFechas | null {
  if (preset === 'personalizado') {
    if (fechaDesde === '' || fechaHasta === '') return null;
    if (fechaDesde > fechaHasta) return null;
    return { fechaDesde, fechaHasta };
  }

  if (preset === 'esta-gestion') {
    if (gestionEfectiva === undefined) return null;
    const rango = calcularRangoGestionISO(gestionEfectiva.year, gestionEfectiva.mesInicio);
    return { fechaDesde: rango.fechaInicio, fechaHasta: rango.fechaFin };
  }

  if (preset === 'gestion-anterior') {
    if (gestionAnterior === undefined) return null;
    const rango = calcularRangoGestionISO(gestionAnterior.year, gestionAnterior.mesInicio);
    return { fechaDesde: rango.fechaInicio, fechaHasta: rango.fechaFin };
  }

  if (preset === 'este-mes') {
    return {
      fechaDesde: primerDiaDelMesISO(),
      fechaHasta: ultimoDiaDelMesISO(),
    };
  }

  if (preset === 'mes-anterior') {
    const rango = rangoMesAnteriorISO();
    return { fechaDesde: rango.fechaDesde, fechaHasta: rango.fechaHasta };
  }

  return null;
}

// ============================================================
// Componente
// ============================================================

/**
 * Filtro compartido de período fiscal — modelo QuickBooks (presets).
 *
 * Emite SIEMPRE un `RangoFechas { fechaDesde, fechaHasta }` vía `onChange`.
 * Elimina el XOR { modo:'periodo' | 'rango' } previo.
 *
 * 5 presets:
 * - "Esta gestión": rango completo de la gestión más reciente (ABIERTA primero).
 * - "Gestión anterior": rango de la gestión inmediatamente anterior.
 *   Deshabilitada si no hay gestión previa (afordancia §14.7).
 * - "Este mes" / "Mes anterior": helpers de lib/fecha-actual (§4.6 — sin
 *   aritmética de Date, basado en Intl para La Paz).
 * - "Personalizado": el usuario tipea las fechas directamente.
 *
 * Invariante: cualquier edición manual de los inputs fuerza el preset a
 * "Personalizado" (no se intenta re-detectar si coincide con un preset).
 *
 * Anti-F-02: la derivación del rango se hace en useMemo, no en useEffect.
 * El único useEffect emite onChange comparando firma JSON (patrón existente).
 */
export function PeriodoGestionFiltro({
  onChange,
  error,
  className,
}: PeriodoGestionFiltroProps): React.JSX.Element {
  // Cross-feature: catálogo de gestiones (plano, sin períodos embebidos).
  const { data: gestiones, isLoading: gestionesLoading } = useGestiones();

  // Ordenar: year DESC; ante mismo year, ABIERTA primero.
  const gestionesOrdenadas = useMemo(
    () =>
      [...(gestiones ?? [])].sort(
        (a, b) =>
          b.year - a.year ||
          (a.status === 'ABIERTA' ? -1 : 0) - (b.status === 'ABIERTA' ? -1 : 0),
      ),
    [gestiones],
  );

  // Gestión efectiva: la más reciente (primera de la lista ordenada).
  const gestionEfectiva = gestionesOrdenadas[0];

  // Gestión anterior: la primera con year estrictamente menor al de la efectiva.
  const gestionAnterior = gestionesOrdenadas.find(
    (g) => gestionEfectiva !== undefined && g.year < gestionEfectiva.year,
  );

  // Estado interno (3 piezas) — Anti-F-02: sin useState derivado de otros estados.
  const [preset, setPreset] = useState<Preset>('esta-gestion');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // ----------------------------------------------------------
  // Handler: seleccionar un preset desde el Select.
  // Resuelve el rango y setea las fechas en state (para que los
  // inputs muestren el rango resuelto y sean editables).
  // NO usa useEffect para derivar — Anti-F-02.
  // ----------------------------------------------------------
  function handlePresetChange(nuevoPreset: Preset): void {
    const rango = resolverPreset(nuevoPreset, gestionEfectiva, gestionAnterior, fechaDesde, fechaHasta);
    if (rango !== null) {
      setFechaDesde(rango.fechaDesde);
      setFechaHasta(rango.fechaHasta);
    }
    setPreset(nuevoPreset);
  }

  // Handler: editar el input Desde manualmente → siempre "Personalizado".
  function handleFechaDesdeChange(valor: string): void {
    setFechaDesde(valor);
    setPreset('personalizado');
  }

  // Handler: editar el input Hasta manualmente → siempre "Personalizado".
  function handleFechaHastaChange(valor: string): void {
    setFechaHasta(valor);
    setPreset('personalizado');
  }

  // ----------------------------------------------------------
  // useMemo de emisión (Anti-F-02): el rango a emitir se DERIVA.
  // Para preset !== 'personalizado': re-resuelve el preset desde
  // los datos cargados (fuente de verdad, no el state de fechas).
  // Para 'personalizado': usa el state (lo tipeó el usuario).
  // ----------------------------------------------------------
  const rangoResuelto: RangoFechas | null = useMemo(
    () => resolverPreset(preset, gestionEfectiva, gestionAnterior, fechaDesde, fechaHasta),
    [preset, gestionEfectiva, gestionAnterior, fechaDesde, fechaHasta],
  );

  // Una sola vía de emisión. Compara firma JSON para no emitir el mismo valor dos veces.
  const ultimaFirmaEmitida = useRef<string>('');
  useEffect(() => {
    if (rangoResuelto === null) return;
    const firma = JSON.stringify(rangoResuelto);
    if (ultimaFirmaEmitida.current === firma) return;
    ultimaFirmaEmitida.current = firma;
    onChange(rangoResuelto);
    // onChange es estable por contrato (viene de la page o RHF); no se incluye
    // en el dep array para evitar loops. eslint-disable-next-line consistente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangoResuelto]);

  // ----------------------------------------------------------
  // Estados de carga / vacío (misma afordancia que antes)
  // ----------------------------------------------------------
  if (gestionesLoading) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        Cargando gestiones…
      </p>
    );
  }

  if (gestionesOrdenadas.length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground',
          className,
        )}
      >
        No hay gestiones fiscales todavía. Creá una gestión para poder consultar reportes.
      </div>
    );
  }

  const hayGestionAnterior = gestionAnterior !== undefined;

  return (
    <TooltipProvider>
      <div className={cn('space-y-3', className)}>
        {/* Período + rango Desde/Hasta en UNA sola fila (ahorra espacio
            vertical; en mobile el flex-wrap los apila). */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Selector de preset */}
          <div className="space-y-1">
            <Label htmlFor="pgf-preset" className="text-xs text-muted-foreground">
              Período
            </Label>
            <Select
              value={preset}
              onValueChange={(v) => handlePresetChange(v as Preset)}
            >
              <SelectTrigger
                id="pgf-preset"
                className="h-8 text-sm w-52"
                aria-label="Preset de período"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="esta-gestion">
                  {LABELS_PRESET['esta-gestion']}
                </SelectItem>

                {/* "Gestión anterior" deshabilitada si no hay gestión previa — §14.7 */}
                {hayGestionAnterior ? (
                  <SelectItem value="gestion-anterior">
                    {LABELS_PRESET['gestion-anterior']}
                  </SelectItem>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* span necesario: SelectItem disabled no dispara Tooltip en Radix */}
                      <span>
                        <SelectItem value="gestion-anterior" disabled>
                          {LABELS_PRESET['gestion-anterior']}
                        </SelectItem>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      No hay gestión anterior registrada
                    </TooltipContent>
                  </Tooltip>
                )}

                <SelectItem value="este-mes">{LABELS_PRESET['este-mes']}</SelectItem>
                <SelectItem value="mes-anterior">{LABELS_PRESET['mes-anterior']}</SelectItem>
                <SelectItem value="personalizado">{LABELS_PRESET['personalizado']}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Inputs Desde / Hasta — SIEMPRE visibles (modelo QuickBooks) */}
          <div className="space-y-1">
            <Label htmlFor="pgf-fecha-desde" className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              id="pgf-fecha-desde"
              type="date"
              className="h-8 w-40 text-base md:text-sm"
              aria-invalid={error !== undefined}
              value={fechaDesde}
              onChange={(e) => handleFechaDesdeChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pgf-fecha-hasta" className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="pgf-fecha-hasta"
              type="date"
              className="h-8 w-40 text-base md:text-sm"
              aria-invalid={error !== undefined}
              value={fechaHasta}
              onChange={(e) => handleFechaHastaChange(e.target.value)}
            />
          </div>
        </div>

        {error !== undefined && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </TooltipProvider>
  );
}
