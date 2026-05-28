import { useSearchParams } from 'react-router-dom';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

/**
 * Filtros para la lista de comprobantes.
 * Lee y escribe estado via `useSearchParams` (URL state — CLAUDE.md frontend §4).
 * Campos: tipo (enum + "Todos"), estado (enum + "Todos"), toggle "Mostrar anulados".
 */
export function ComprobantesFilters(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();

  const tipo = searchParams.get('tipo') ?? '';
  const estado = searchParams.get('estado') ?? '';
  const incluirAnulados = searchParams.get('incluirAnulados') === 'true';

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
  );
}
