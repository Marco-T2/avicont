import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

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
import { formatPeriodoCorto } from '@/lib/meses';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { usePeriodos } from '@/features/periodos-fiscales/hooks/use-periodos';

/**
 * Filtros para la lista de comprobantes.
 * Lee y escribe estado via `useSearchParams` (URL state — CLAUDE.md frontend §4).
 * Campos: búsqueda libre (número + glosa), tipo, estado, período fiscal,
 * toggle "Mostrar anulados".
 */
export function ComprobantesFilters(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();

  const tipo = searchParams.get('tipo') ?? '';
  const estado = searchParams.get('estado') ?? '';
  const periodoFiscalId = searchParams.get('periodoFiscalId') ?? '';
  const incluirAnulados = searchParams.get('incluirAnulados') === 'true';

  // Cross-feature: períodos del tenant para el selector temporal.
  const { data: periodos } = usePeriodos();
  const periodosOrdenados = useMemo(
    () => [...(periodos ?? [])].sort((a, b) => b.year - a.year || b.month - a.month),
    [periodos],
  );

  // La búsqueda vive en estado local para feedback instantáneo y se vuelca a la
  // URL ya debounceada — así no se dispara un refetch ni una entrada de historial
  // por cada tecla.
  const [qInput, setQInput] = useState(() => searchParams.get('q') ?? '');
  const debouncedQ = useDebouncedValue(qInput, 300);

  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (current === debouncedQ) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedQ === '') {
        next.delete('q');
      } else {
        next.set('q', debouncedQ);
      }
      next.delete('page');
      return next;
    });
    // Solo reacciona al valor debounceado; searchParams/setSearchParams quedan fuera
    // a propósito para no re-correr ante cambios de otros filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  function setParam(key: string, value: string | null): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
        // Al cambiar filtro, resetear página
        next.delete('page');
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {/* Búsqueda libre (número + glosa) */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Buscar por número o glosa…"
          aria-label="Buscar comprobante"
          className="pl-9 pr-9 text-base md:text-sm"
        />
        {qInput.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Limpiar búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => setQInput('')}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Filtro tipo */}
        <div className="space-y-1">
          <Label htmlFor="filter-tipo" className="text-xs text-muted-foreground">
            Tipo
          </Label>
          <Select
            value={tipo === '' ? 'todos' : tipo}
            onValueChange={(v) => setParam('tipo', v === 'todos' ? '' : v)}
          >
            <SelectTrigger id="filter-tipo" className="h-8 text-sm w-36">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="DIARIO">Diario</SelectItem>
              <SelectItem value="INGRESO">Ingreso</SelectItem>
              <SelectItem value="EGRESO">Egreso</SelectItem>
              <SelectItem value="TRASPASO">Traspaso</SelectItem>
              <SelectItem value="AJUSTE">Ajuste</SelectItem>
              <SelectItem value="APERTURA">Apertura</SelectItem>
              <SelectItem value="CIERRE">Cierre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtro estado */}
        <div className="space-y-1">
          <Label htmlFor="filter-estado" className="text-xs text-muted-foreground">
            Estado
          </Label>
          <Select
            value={estado === '' ? 'todos' : estado}
            onValueChange={(v) => setParam('estado', v === 'todos' ? '' : v)}
          >
            <SelectTrigger id="filter-estado" className="h-8 text-sm w-40">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="BORRADOR">Borrador</SelectItem>
              <SelectItem value="CONTABILIZADO">Contabilizado</SelectItem>
              <SelectItem value="BLOQUEADO">Cerrado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtro período fiscal */}
        <div className="space-y-1">
          <Label htmlFor="filter-periodo" className="text-xs text-muted-foreground">
            Período
          </Label>
          <Select
            value={periodoFiscalId === '' ? 'todos' : periodoFiscalId}
            onValueChange={(v) => setParam('periodoFiscalId', v === 'todos' ? '' : v)}
          >
            <SelectTrigger id="filter-periodo" className="h-8 text-sm w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {periodosOrdenados.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {formatPeriodoCorto(p.year, p.month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Toggle mostrar anulados */}
        <div className="flex items-center gap-2 pb-0.5">
          <Switch
            id="filter-anulados"
            checked={incluirAnulados}
            onCheckedChange={(checked) =>
              setParam('incluirAnulados', checked ? 'true' : null)
            }
          />
          <Label htmlFor="filter-anulados" className="text-sm cursor-pointer">
            Mostrar anulados
          </Label>
        </div>
      </div>
    </div>
  );
}
