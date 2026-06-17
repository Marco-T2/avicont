import { useState } from 'react';

import {
  PeriodoGestionFiltro,
  type PeriodoSeleccion,
} from '@/components/shared/periodo-gestion-filtro';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
// Cross-feature: reutilizamos CuentaAutocomplete de comprobantes — filtra
// cuentas de detalle activas con pageSize 100.
import { CuentaAutocomplete } from '@/features/comprobantes/components/cuenta-autocomplete';

import type { LibroDiarioFiltroValues } from '../schemas/libro-diario-filtro-schema';

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
 * El período se elige con `<PeriodoGestionFiltro>` (Gestión + Mes, con opción
 * "Todos" → rango de toda la gestión, y un toggle de rango personalizado). La
 * selección resuelta (`PeriodoSeleccion`) se mapea al payload XOR período/rango
 * de `LibroDiarioFiltroValues` SIN cambiar el contrato que recibe la page.
 *
 * Toggles propios que conserva: "Incluir anulados" y la cuenta opcional
 * (CuentaAutocomplete). Se manejan con `useState` local (no hay validación
 * cruzada entre ellos).
 */
export function LibroDiarioFiltros({
  onBuscar,
  isFetching = false,
}: LibroDiarioFiltrosProps): React.JSX.Element {
  // La selección de período la resuelve PeriodoGestionFiltro y la emite por onChange.
  const [seleccion, setSeleccion] = useState<PeriodoSeleccion | null>(null);
  const [incluirAnulados, setIncluirAnulados] = useState(false);
  const [cuentaId, setCuentaId] = useState('');
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

    const togglesYCuenta = {
      incluirAnulados,
      ...(cuentaId !== '' ? { cuentaId } : {}),
    };

    if (seleccion.modo === 'periodo') {
      onBuscar({
        modo: 'periodo',
        periodoFiscalId: seleccion.periodoFiscalId,
        ...togglesYCuenta,
      });
    } else {
      onBuscar({
        modo: 'rango',
        fechaDesde: seleccion.fechaDesde,
        fechaHasta: seleccion.fechaHasta,
        ...togglesYCuenta,
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
              onChange={setCuentaId}
              placeholder="Todas las cuentas"
            />
          </div>
        </div>

        {/* Toggle incluir anulados */}
        <div className="flex items-center gap-2 pb-0.5">
          <Switch
            id="libro-anulados"
            checked={incluirAnulados}
            onCheckedChange={setIncluirAnulados}
          />
          <Label htmlFor="libro-anulados" className="text-sm cursor-pointer">
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
