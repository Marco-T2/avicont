import { useState } from 'react';

import {
  PeriodoGestionFiltro,
  type PeriodoSeleccion,
} from '@/components/shared/periodo-gestion-filtro';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import type { BalanceComprobacionFiltroValues } from '../schemas/balance-comprobacion-filtro-schema';

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
 * El período se elige con `<PeriodoGestionFiltro>` (Gestión + Mes, con opción
 * "Todos" → rango de toda la gestión, y un toggle de rango personalizado). La
 * selección resuelta (`PeriodoSeleccion`) se mapea al payload XOR período/rango
 * de `BalanceComprobacionFiltroValues` SIN cambiar el contrato que recibe la page.
 *
 * Toggle propio que conserva: "Incluir anulados" (REQ-BC-08).
 */
export function BalanceComprobacionFiltros({
  onBuscar,
  isFetching = false,
}: BalanceComprobacionFiltrosProps): React.JSX.Element {
  // La selección de período la resuelve PeriodoGestionFiltro y la emite por onChange.
  const [seleccion, setSeleccion] = useState<PeriodoSeleccion | null>(null);
  const [incluirAnulados, setIncluirAnulados] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  function handleConsultar(): void {
    if (seleccion === null) {
      setError('Seleccioná un período o rango de fechas');
      return;
    }

    if (
      seleccion.modo === 'rango' &&
      (seleccion.fechaDesde === '' || seleccion.fechaHasta === '')
    ) {
      setError('Completá las fechas del rango');
      return;
    }

    if (seleccion.modo === 'rango' && seleccion.fechaDesde > seleccion.fechaHasta) {
      setError('La fecha final no puede ser anterior a la fecha inicial');
      return;
    }

    setError(undefined);

    if (seleccion.modo === 'periodo') {
      onBuscar({
        modo: 'periodo',
        periodoFiscalId: seleccion.periodoFiscalId,
        incluirAnulados,
      });
    } else {
      onBuscar({
        modo: 'rango',
        fechaDesde: seleccion.fechaDesde,
        fechaHasta: seleccion.fechaHasta,
        incluirAnulados,
      });
    }
  }

  return (
    <div className="space-y-4">
      <PeriodoGestionFiltro
        value={seleccion}
        onChange={(sel) => {
          setSeleccion(sel);
          setError(undefined);
        }}
        error={error}
      />

      <div className="flex flex-wrap items-end gap-3">
        {/* Toggle incluir anulados */}
        <div className="flex items-center gap-2 pb-0.5">
          <Switch
            id="bc-anulados"
            checked={incluirAnulados}
            onCheckedChange={setIncluirAnulados}
          />
          <Label htmlFor="bc-anulados" className="text-sm cursor-pointer">
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
