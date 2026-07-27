import { useState } from 'react';

import {
  PeriodoGestionFiltro,
  type RangoFechas,
} from '@/components/shared/periodo-gestion-filtro';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// Cross-feature: catálogo de cuentas bancarias del tenant para el selector.
// Solo las activas: conciliar contra una cuenta dada de baja no tiene sentido.
import { useCuentasBancarias } from '@/features/cuentas-bancarias/hooks/use-cuentas-bancarias';
import type { WorkspaceConciliacionParams } from '@/types/api';

interface ConciliacionFiltrosProps {
  onBuscar: (params: WorkspaceConciliacionParams) => void;
  isFetching: boolean;
}

/**
 * Filtros del workspace: cuenta bancaria + rango.
 *
 * Los 3 parámetros son OBLIGATORIOS para el backend (design §10): sin acotar el
 * rango la lectura crecería sin techo. La validación local evita mandar una
 * request que ya sabemos que va a fallar.
 */
export function ConciliacionFiltros({
  onBuscar,
  isFetching,
}: ConciliacionFiltrosProps): React.JSX.Element {
  const { data } = useCuentasBancarias({ activa: true, pageSize: 100 });
  const cuentas = data?.items ?? [];

  const [cuentaBancariaId, setCuentaBancariaId] = useState<string | null>(null);
  const [rango, setRango] = useState<RangoFechas | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleConsultar(): void {
    if (cuentaBancariaId === null) {
      setError('Seleccioná una cuenta bancaria');
      return;
    }
    if (rango === null || rango.fechaDesde === '' || rango.fechaHasta === '') {
      setError('Seleccioná un período o rango de fechas');
      return;
    }
    if (rango.fechaDesde > rango.fechaHasta) {
      setError('La fecha final no puede ser anterior a la fecha inicial');
      return;
    }

    setError(null);
    onBuscar({
      cuentaBancariaId,
      desde: rango.fechaDesde,
      hasta: rango.fechaHasta,
    });
  }

  if (cuentas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay cuentas bancarias configuradas. Creá una en Configuración → Cuentas bancarias
        antes de conciliar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <Label htmlFor="cuenta-bancaria-conciliacion">Cuenta bancaria</Label>
        <Select
          value={cuentaBancariaId ?? undefined}
          onValueChange={(v) => {
            setCuentaBancariaId(v);
            setError(null);
          }}
        >
          {/* `w-full` en el trigger, no en el div: el primitivo es `w-fit` y
              con la etiqueta `alias · numeroCuenta` se desborda de su columna. */}
          <SelectTrigger
            id="cuenta-bancaria-conciliacion"
            aria-label="Cuenta bancaria"
            className="w-full"
          >
            <SelectValue placeholder="Elegí una cuenta" />
          </SelectTrigger>
          <SelectContent>
            {cuentas.map((cb) => (
              <SelectItem key={cb.id} value={cb.id}>
                {cb.alias}
                {cb.numeroCuenta !== null ? ` · ${cb.numeroCuenta}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PeriodoGestionFiltro
        onChange={(r) => {
          setRango(r);
          setError(null);
        }}
      />

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" size="sm" onClick={handleConsultar} disabled={isFetching}>
        {isFetching ? 'Consultando…' : 'Consultar'}
      </Button>
    </div>
  );
}
