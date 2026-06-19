import { useState } from 'react';

import {
  PeriodoGestionFiltro,
  type RangoFechas,
} from '@/components/shared/periodo-gestion-filtro';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import type { HojaTrabajoFiltroValues } from '../schemas/hoja-trabajo-filtro-schema';

// ============================================================
// Props
// ============================================================

interface HojaTrabajoFiltrosProps {
  /** Callback cuando el usuario envía el formulario con filtros válidos. */
  onBuscar: (values: HojaTrabajoFiltroValues) => void;
  /** Indica si hay una búsqueda activa (para deshabilitar el botón). */
  isFetching?: boolean;
}

// ============================================================
// Componente
// ============================================================

/**
 * Panel de filtros de la Hoja de Trabajo de 12 columnas.
 *
 * El período se elige con `<PeriodoGestionFiltro>` (presets: esta gestión,
 * gestión anterior, este mes, mes anterior, personalizado). El componente
 * compartido siempre emite un `RangoFechas { fechaDesde, fechaHasta }`.
 *
 * Toggle propio que conserva: "Incluir anulados".
 */
export function HojaTrabajoFiltros({
  onBuscar,
  isFetching = false,
}: HojaTrabajoFiltrosProps): React.JSX.Element {
  // El componente compartido emite RangoFechas; lo guardamos en estado local.
  const [seleccion, setSeleccion] = useState<RangoFechas | null>(null);
  const [incluirAnulados, setIncluirAnulados] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  function handleConsultar(): void {
    if (seleccion === null) {
      setError('Seleccioná un período o rango de fechas');
      return;
    }

    if (seleccion.fechaDesde === '' || seleccion.fechaHasta === '') {
      setError('Completá las fechas del rango');
      return;
    }

    if (seleccion.fechaDesde > seleccion.fechaHasta) {
      setError('La fecha final no puede ser anterior a la fecha inicial');
      return;
    }

    setError(undefined);

    onBuscar({
      fechaDesde: seleccion.fechaDesde,
      fechaHasta: seleccion.fechaHasta,
      incluirAnulados,
    });
  }

  return (
    <div className="space-y-4">
      <PeriodoGestionFiltro
        onChange={(r) => {
          setSeleccion(r);
          setError(undefined);
        }}
        error={error}
      />

      <div className="flex flex-wrap items-end gap-3">
        {/* Toggle incluir anulados */}
        <div className="flex items-center gap-2 pb-0.5">
          <Switch
            id="ht-anulados"
            checked={incluirAnulados}
            onCheckedChange={setIncluirAnulados}
          />
          <Label htmlFor="ht-anulados" className="text-sm cursor-pointer">
            Incluir anulados
          </Label>
        </div>

        {/* Botón consultar */}
        <Button
          type="button"
          onClick={handleConsultar}
          disabled={isFetching}
          size="sm"
          className="self-end"
        >
          {isFetching ? 'Consultando…' : 'Consultar'}
        </Button>
      </div>
    </div>
  );
}
