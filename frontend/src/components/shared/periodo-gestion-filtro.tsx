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
import { Switch } from '@/components/ui/switch';
// Cross-feature: catálogo de gestiones del tenant para el selector de gestión.
import { useGestiones } from '@/features/periodos-fiscales/hooks/use-gestiones';
// Cross-feature: períodos del tenant filtrados por gestión para el selector de mes.
import { usePeriodos } from '@/features/periodos-fiscales/hooks/use-periodos';
import { NOMBRE_MES } from '@/lib/meses';
import { cn } from '@/lib/utils';

// ============================================================
// Contrato de salida — XOR entre {periodo} y {rango}.
// Espeja lo que aceptan los reportes EEFF: período fiscal puntual
// O rango de fechas libre. Las fechas vienen YA en YYYY-MM-DD
// (proyectadas por el backend en cada Periodo) — nunca se calculan
// a mano acá (§4.6).
// ============================================================

export type PeriodoSeleccion =
  | { modo: 'periodo'; periodoFiscalId: string }
  | { modo: 'rango'; fechaDesde: string; fechaHasta: string };

interface PeriodoGestionFiltroProps {
  /**
   * Selección actual resuelta (parte del contrato externo del componente).
   * El componente es self-resolving: maneja su estado interno y emite el
   * `onChange` resuelto. `value` se acepta para que el caller pueda inspeccionar
   * la selección vigente; no se usa para controlar el estado interno (`null` =
   * aún sin resolver, el componente emite el default al montar).
   */
  value?: PeriodoSeleccion | null;
  /** Se llama cada vez que cambia la selección con el `PeriodoSeleccion` ya resuelto. */
  onChange: (sel: PeriodoSeleccion) => void;
  /** Mensaje de validación a mostrar (lo provee el form que envuelve al componente). */
  error?: string;
  className?: string;
}

// Sentinel para la opción "Todos" del select de mes (un value vacío rompe Radix Select).
const MES_TODOS = '__todos__';

// ============================================================
// Componente
// ============================================================

/**
 * Filtro compartido de período fiscal por Gestión + Mes.
 *
 * Reemplaza el `<Select>` plano que listaba TODOS los períodos del tenant
 * (12 × N gestiones) por dos selects acotados: Gestión + Mes (con opción
 * "Todos"). Conserva el modo "rango de fechas libre" detrás de un toggle.
 *
 * Mapeo de la selección al contrato de salida:
 * - Gestión G + mes específico P → `{ modo: 'periodo', periodoFiscalId: P.id }`.
 * - Gestión G + "Todos"          → `{ modo: 'rango', fechaDesde: 1erPeríodo.fechaInicio,
 *                                     fechaHasta: últimoPeríodo.fechaFin }`.
 * - Toggle rango personalizado    → `{ modo: 'rango', fechaDesde, fechaHasta }`.
 *
 * Defaults al montar: gestión más reciente (year DESC; preferí ABIERTA si hay
 * varias del mismo year), mes "Todos". Emite el `onChange` inicial para que el
 * form quede VÁLIDO desde el arranque (no se auto-consulta — eso lo decide la page).
 */
export function PeriodoGestionFiltro({
  onChange,
  error,
  className,
}: PeriodoGestionFiltroProps): React.JSX.Element {
  // Cross-feature: catálogo de gestiones del tenant (plano, sin períodos embebidos).
  const { data: gestiones, isLoading: gestionesLoading } = useGestiones();

  const gestionesOrdenadas = useMemo(
    () =>
      [...(gestiones ?? [])].sort(
        (a, b) =>
          // year DESC; ante mismo year, la ABIERTA primero (es la de trabajo).
          b.year - a.year ||
          (a.status === 'ABIERTA' ? -1 : 0) - (b.status === 'ABIERTA' ? -1 : 0),
      ),
    [gestiones],
  );

  // gestión elegida explícitamente por el usuario; null = aún no eligió,
  // se usa el default derivado (la más reciente). Evita setState-en-efecto.
  const [gestionElegida, setGestionElegida] = useState<string | null>(null);
  // mes: MES_TODOS o el id de un período concreto de la gestión seleccionada.
  const [mes, setMes] = useState<string>(MES_TODOS);
  const [usarRangoLibre, setUsarRangoLibre] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Gestión efectiva: la elegida o, por default, la más reciente (year DESC,
  // ABIERTA primero). Derivada — sin efecto, sin estado redundante.
  const gestionId: string | null =
    gestionElegida ?? gestionesOrdenadas[0]?.id ?? null;

  // Cross-feature: períodos de la gestión seleccionada para el select de mes.
  const { data: periodos, isLoading: periodosLoading } = usePeriodos(
    gestionId !== null ? { gestionId } : {},
  );

  const periodosOrdenados = useMemo(
    () =>
      [...(periodos ?? [])].sort((a, b) => a.ordenEnGestion - b.ordenEnGestion),
    [periodos],
  );

  // ----------------------------------------------------------
  // Resolución de la selección → PeriodoSeleccion.
  // Función pura: misma entrada, misma salida. `null` = aún no resoluble
  // (ej. "Todos" sin períodos cargados).
  // ----------------------------------------------------------
  const seleccionResuelta: PeriodoSeleccion | null = useMemo(() => {
    if (usarRangoLibre) {
      return { modo: 'rango', fechaDesde, fechaHasta };
    }
    if (mes !== MES_TODOS) {
      return { modo: 'periodo', periodoFiscalId: mes };
    }
    // Mes "Todos" → rango de toda la gestión (fechas del 1er y último período).
    const primero = periodosOrdenados[0];
    const ultimo = periodosOrdenados[periodosOrdenados.length - 1];
    if (primero === undefined || ultimo === undefined) return null;
    return { modo: 'rango', fechaDesde: primero.fechaInicio, fechaHasta: ultimo.fechaFin };
  }, [usarRangoLibre, fechaDesde, fechaHasta, mes, periodosOrdenados]);

  // Emite onChange cuando la selección resuelta cambia. Una sola vía de emisión
  // (incluido el default al montar): los handlers solo actualizan estado.
  const ultimaFirmaEmitida = useRef<string>('');
  useEffect(() => {
    if (seleccionResuelta === null) return;
    const firma = JSON.stringify(seleccionResuelta);
    if (ultimaFirmaEmitida.current === firma) return;
    ultimaFirmaEmitida.current = firma;
    onChange(seleccionResuelta);
    // onChange es estable por contrato (viene de RHF/page); no se incluye para evitar loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionResuelta]);

  function handleGestionChange(nuevaGestionId: string): void {
    setGestionElegida(nuevaGestionId);
    // Al cambiar de gestión, reseteamos el mes a "Todos" (los períodos son otros).
    setMes(MES_TODOS);
  }

  // ----------------------------------------------------------
  // Estados de carga / vacío
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

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end gap-3">
        {/* Selector de gestión */}
        <div className="space-y-1">
          <Label htmlFor="pgf-gestion" className="text-xs text-muted-foreground">
            Gestión
          </Label>
          <Select
            value={gestionId ?? undefined}
            onValueChange={handleGestionChange}
            disabled={usarRangoLibre}
          >
            <SelectTrigger id="pgf-gestion" className="h-8 text-sm w-44">
              <SelectValue placeholder="Seleccionar gestión" />
            </SelectTrigger>
            <SelectContent>
              {gestionesOrdenadas.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  Gestión {g.year}
                  {g.status === 'ABIERTA' ? ' (Abierta)' : ' (Cerrada)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Selector de mes (con opción "Todos") */}
        <div className="space-y-1">
          <Label htmlFor="pgf-mes" className="text-xs text-muted-foreground">
            Mes
          </Label>
          <Select
            value={mes}
            onValueChange={setMes}
            disabled={usarRangoLibre || periodosLoading}
          >
            <SelectTrigger
              id="pgf-mes"
              className="h-8 text-sm w-44"
              aria-invalid={error !== undefined}
            >
              <SelectValue placeholder="Seleccionar mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MES_TODOS}>Todos los meses</SelectItem>
              {periodosOrdenados.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {NOMBRE_MES[p.month] ?? p.month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Toggle de rango personalizado */}
      <div className="flex items-center gap-2">
        <Switch
          id="pgf-rango-libre"
          checked={usarRangoLibre}
          onCheckedChange={setUsarRangoLibre}
        />
        <Label htmlFor="pgf-rango-libre" className="text-sm cursor-pointer">
          Rango de fechas personalizado
        </Label>
      </div>

      {/* Inputs de rango libre */}
      {usarRangoLibre && (
        <div className="flex flex-wrap items-end gap-3">
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
              onChange={(e) => setFechaDesde(e.target.value)}
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
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
        </div>
      )}

      {error !== undefined && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
