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

/**
 * Divisor entre grupos de filtros relacionados. Decorativo: `aria-hidden`
 * porque el agrupamiento ya lo comunican los labels, y un lector de pantalla no
 * gana nada anunciando una raya.
 *
 * Solo desde `xl` (1280) y NO por capricho de "escritorio": medido, una barra en
 * un punto de quiebre del flex-wrap queda colgando en el vacío al final de la
 * línea, y por debajo de 1280 el ancho disponible (686 px a 1024) no alcanza ni
 * para `Cuenta + Período` juntos. Abajo de ese umbral los campos se apilan y no
 * hay nada que dividir.
 *
 * `h-8` = alto del control, así la raya se alinea con los inputs y no con los
 * labels (que viven arriba). Con `items-end` en el contenedor, la base coincide.
 */
function SeparadorGrupo(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      data-sep="grupo"
      className="hidden h-8 w-px bg-border xl:block"
    />
  );
}

/**
 * Quiebre de línea DELIBERADO entre el 2º y el 3er grupo, a partir de `xl`.
 *
 * Sin esto el wrap cae donde el ancho se agota y deja una barra huérfana: a 1440
 * la línea termina en `… Monto desde │` y Estado baja solo. Los 4 grupos entran
 * en una sola línea recién desde ~1680 (piden 1263 px y a 1440 hay 1102), y no
 * hay breakpoint de Tailwind en ese punto — así que se fija 2 grupos por línea
 * de forma consistente en todo el rango de escritorio, con las barras siempre
 * internas a su línea.
 *
 * Se pagan 2 líneas en pantallas muy anchas donde 1 alcanzaría; a cambio el
 * layout es predecible y nunca muestra un divisor que no divide nada.
 */
function QuiebreDeGrupo(): React.JSX.Element {
  return <div aria-hidden="true" data-quiebre="grupo" className="hidden w-full xl:block" />;
}

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
    <div className="space-y-3">
      {/* Una sola fila de filtros: Cuenta · Período+Desde/Hasta · Montos · Estado.
          El grid anterior (sm:grid-cols-2 xl:grid-cols-4) estiraba 4 campos
          angostos al ancho completo y dejaba media pantalla vacía. Acá cada
          control ocupa lo que necesita y el flex-wrap los apila en mobile.

          `items-end` alinea los controles por su base, que es lo que hace que el
          bloque de período (label text-xs + control h-8) quede a ras de los de
          acá — por eso estos replican esa métrica en vez de usar la default. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label
            htmlFor="verificador-cuenta"
            className="text-xs text-muted-foreground"
          >
            Cuenta bancaria
          </Label>
          <Select value={cuentaBancariaId} onValueChange={setCuentaBancariaId}>
            <SelectTrigger
              id="verificador-cuenta"
              className="h-11 sm:h-8 w-48 text-sm"
              aria-label="Cuenta bancaria"
            >
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

        <SeparadorGrupo />

        <PeriodoGestionFiltro
          onChange={(r) => {
            setRango(r);
            setError(null);
          }}
        />

        <QuiebreDeGrupo />

        {/* Los dos montos son UN grupo: el wrapper evita que el flex-wrap los
            parta y deje un divisor huérfano entre ellos. */}
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label
              htmlFor="verificador-monto-desde"
              className="text-xs text-muted-foreground"
            >
              Monto desde
            </Label>
            <Input
              id="verificador-monto-desde"
              inputMode="decimal"
              placeholder="0.00"
              className="h-8 w-32 text-base md:text-sm"
              value={montoDesde}
              onChange={(e) => {
                setMontoDesde(e.target.value);
                setError(null);
              }}
            />
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="verificador-monto-hasta"
              className="text-xs text-muted-foreground"
            >
              Monto hasta
            </Label>
            <Input
              id="verificador-monto-hasta"
              inputMode="decimal"
              placeholder="0.00"
              className="h-8 w-32 text-base md:text-sm"
              value={montoHasta}
              onChange={(e) => {
                setMontoHasta(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>

        <SeparadorGrupo />

        <div className="space-y-1">
          <Label
            htmlFor="verificador-estado"
            className="text-xs text-muted-foreground"
          >
            Estado
          </Label>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger
              id="verificador-estado"
              className="h-11 sm:h-8 w-44 text-sm"
              aria-label="Estado"
            >
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
      </div>

      <div className="space-y-1 sm:max-w-md">
        <Label htmlFor="verificador-glosa" className="text-xs text-muted-foreground">
          Glosa
        </Label>
        <Input
          id="verificador-glosa"
          placeholder="Buscar en la descripción (ignora mayúsculas y tildes)"
          className="h-8 text-base md:text-sm"
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
