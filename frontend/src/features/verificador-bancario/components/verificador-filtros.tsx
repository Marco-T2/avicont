import { useState } from 'react';

import {
  PeriodoGestionFiltro,
  type RangoFechas,
} from '@/components/shared/periodo-gestion-filtro';
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
// Cross-feature: catálogo de cuentas bancarias del tenant para el filtro
// opcional. `activa: 'all'`: el verificador es de solo lectura y los
// movimientos de una cuenta dada de baja siguen existiendo en el rango.
// pageSize 100 = límite del backend.
import { useCuentasBancarias } from '@/features/cuentas-bancarias/hooks/use-cuentas-bancarias';
// Cross-feature: mismas etiquetas de estado que el workspace (mismo módulo).
import { etiquetaEstadoEfectivoMovimiento } from '@/features/conciliacion/lib/etiquetas-conciliacion';
import type { EstadoMovimientoBancario, ListarMovimientosBancariosParams } from '@/types/api';

/** Filtros del verificador, sin paginación (la página maneja `page`/`limit`). */
export type FiltrosVerificador = Omit<ListarMovimientosBancariosParams, 'page' | 'limit'>;

interface VerificadorFiltrosProps {
  onBuscar: (filtros: FiltrosVerificador) => void;
  isFetching: boolean;
}

// Radix Select no acepta value vacío: sentinelas para los "sin filtro".
const TODAS_LAS_CUENTAS = '__todas__';
const TODOS_LOS_ESTADOS = '__todos__';

const ESTADOS: EstadoMovimientoBancario[] = ['PENDIENTE', 'CONCILIADO', 'IGNORADO'];

// Espeja la validación del DTO backend (montos string §4.5).
const MONTO_REGEX = /^\d+(\.\d{1,2})?$/;

/**
 * Filtros del mayor unificado (REQ-VMB-01/02/03).
 *
 * Solo el rango es obligatorio. El estado es OPT-IN deliberado: la vista por
 * defecto NO filtra por estado — el estado acompaña cada fila como señal
 * informativa, nunca como compuerta (principio "apoyo, no limitante").
 */
export function VerificadorFiltros({
  onBuscar,
  isFetching,
}: VerificadorFiltrosProps): React.JSX.Element {
  const { data } = useCuentasBancarias({ activa: 'all', pageSize: 100 });
  const cuentas = data?.items ?? [];

  const [rango, setRango] = useState<RangoFechas | null>(null);
  const [cuentaBancariaId, setCuentaBancariaId] = useState<string>(TODAS_LAS_CUENTAS);
  const [estado, setEstado] = useState<string>(TODOS_LOS_ESTADOS);
  const [montoDesde, setMontoDesde] = useState('');
  const [montoHasta, setMontoHasta] = useState('');
  const [glosa, setGlosa] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleConsultar(): void {
    if (rango === null || rango.fechaDesde === '' || rango.fechaHasta === '') {
      setError('Seleccioná un período o rango de fechas');
      return;
    }
    if (rango.fechaDesde > rango.fechaHasta) {
      setError('La fecha final no puede ser anterior a la fecha inicial');
      return;
    }
    const montoDesdeLimpio = montoDesde.trim();
    const montoHastaLimpio = montoHasta.trim();
    if (montoDesdeLimpio !== '' && !MONTO_REGEX.test(montoDesdeLimpio)) {
      setError('El monto desde debe ser un número con hasta 2 decimales (ej. 100.50)');
      return;
    }
    if (montoHastaLimpio !== '' && !MONTO_REGEX.test(montoHastaLimpio)) {
      setError('El monto hasta debe ser un número con hasta 2 decimales (ej. 500.00)');
      return;
    }

    setError(null);
    const glosaLimpia = glosa.trim();
    onBuscar({
      desde: rango.fechaDesde,
      hasta: rango.fechaHasta,
      // exactOptionalPropertyTypes: spread condicional, nunca `undefined` explícito.
      ...(cuentaBancariaId !== TODAS_LAS_CUENTAS ? { cuentaBancariaId } : {}),
      ...(estado !== TODOS_LOS_ESTADOS ? { estado: estado as EstadoMovimientoBancario } : {}),
      ...(montoDesdeLimpio !== '' ? { montoDesde: montoDesdeLimpio } : {}),
      ...(montoHastaLimpio !== '' ? { montoHasta: montoHastaLimpio } : {}),
      ...(glosaLimpia !== '' ? { glosa: glosaLimpia } : {}),
    });
  }

  return (
    <div className="space-y-4">
      <PeriodoGestionFiltro
        onChange={(r) => {
          setRango(r);
          setError(null);
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verificador-cuenta">Cuenta bancaria</Label>
          <Select value={cuentaBancariaId} onValueChange={setCuentaBancariaId}>
            <SelectTrigger id="verificador-cuenta" aria-label="Cuenta bancaria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS_LAS_CUENTAS}>Todas las cuentas</SelectItem>
              {cuentas.map((cb) => (
                <SelectItem key={cb.id} value={cb.id}>
                  {cb.alias}
                  {cb.numeroCuenta !== null ? ` · ${cb.numeroCuenta}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verificador-estado">Estado</Label>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger id="verificador-estado" aria-label="Estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_LOS_ESTADOS}>Todos los estados</SelectItem>
              {ESTADOS.map((e) => (
                <SelectItem key={e} value={e}>
                  {etiquetaEstadoEfectivoMovimiento(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verificador-monto-desde">Monto desde</Label>
          <Input
            id="verificador-monto-desde"
            inputMode="decimal"
            placeholder="0.00"
            className="text-base md:text-sm"
            value={montoDesde}
            onChange={(e) => {
              setMontoDesde(e.target.value);
              setError(null);
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verificador-monto-hasta">Monto hasta</Label>
          <Input
            id="verificador-monto-hasta"
            inputMode="decimal"
            placeholder="0.00"
            className="text-base md:text-sm"
            value={montoHasta}
            onChange={(e) => {
              setMontoHasta(e.target.value);
              setError(null);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-md">
        <Label htmlFor="verificador-glosa">Glosa</Label>
        <Input
          id="verificador-glosa"
          placeholder="Buscar en la descripción (ignora mayúsculas y tildes)"
          className="text-base md:text-sm"
          value={glosa}
          onChange={(e) => setGlosa(e.target.value)}
        />
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" size="sm" onClick={handleConsultar} disabled={isFetching}>
        {isFetching ? 'Consultando…' : 'Consultar'}
      </Button>
    </div>
  );
}
