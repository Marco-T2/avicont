import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Periodo } from '@/types/api';

import { EstadoPeriodoBadge } from './estado-periodo-badge';

interface PeriodosTableProps {
  periodos: Periodo[];
  onRowClick: (periodo: Periodo) => void;
}

const NOMBRE_MES: Record<number, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

function formatFecha(iso: string): string {
  // iso = "YYYY-MM-DDTHH:mm:ssZ" o "YYYY-MM-DD"
  return new Date(iso).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/La_Paz',
  });
}

// Tabla de los 12 períodos de una gestión. Sin paginación (12 filas fijas).
// Estrategia responsive: tabla con overflow-x-auto en desktop; card stack en
// mobile (< md) — mismo patrón que CuentaListTable (CLAUDE.md §7 Anti-tabla).
export function PeriodosTable({
  periodos,
  onRowClick,
}: PeriodosTableProps): React.JSX.Element {
  return (
    <>
      {/* Desktop: tabla con scroll horizontal */}
      <div className="hidden md:block relative overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Mes</TableHead>
              <TableHead>Año</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cerrado el</TableHead>
              <TableHead>Cerrado por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodos.map((p) => (
              <TableRow
                key={p.id}
                onClick={() => onRowClick(p)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="text-center font-mono text-xs text-muted-foreground">
                  {p.ordenEnGestion}
                </TableCell>
                <TableCell className="font-medium">
                  {NOMBRE_MES[p.month] ?? p.month}
                </TableCell>
                <TableCell>{p.year}</TableCell>
                <TableCell>
                  <EstadoPeriodoBadge status={p.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.closedAt !== null ? formatFecha(p.closedAt) : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.closedByUserId ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: card stack */}
      <div className="md:hidden space-y-2">
        {periodos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onRowClick(p)}
            className="w-full text-left rounded-md border bg-card p-4 hover:bg-muted/50 min-h-[44px] flex items-start justify-between gap-2"
          >
            <div className="space-y-1">
              <p className="font-medium">
                {NOMBRE_MES[p.month] ?? p.month} {p.year}
              </p>
              {p.closedAt !== null && (
                <p className="text-xs text-muted-foreground">
                  Cerrado: {formatFecha(p.closedAt)}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <EstadoPeriodoBadge status={p.status} />
              <span className="text-xs text-muted-foreground">#{p.ordenEnGestion}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
