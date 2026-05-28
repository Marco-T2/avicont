import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AuditoriaEntry } from '@/types/api';

import { formatearDiffAuditoria } from '../lib/formatear-diff-auditoria';
import { useAuditoria } from '../hooks/use-auditoria';

interface AuditoriaSheetProps {
  comprobanteId: string | null;
  onOpenChange: (open: boolean) => void;
}

// Formatea un timestamp ISO a hora local de La Paz (CLAUDE.md §4.6).
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatearTimestamp(ts: string): string {
  return TIMESTAMP_FORMAT.format(new Date(ts));
}

/**
 * Devuelve una cadena en español relativa al tiempo ("hace 2h", "hace 3m")
 * sin dependencias externas.
 */
function timeAgo(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'hace unos segundos';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `hace ${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  return `hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
}

const OPERATION_LABELS: Record<string, string> = {
  INSERT: 'Creado',
  UPDATE: 'Modificado',
  DELETE: 'Eliminado',
};

const TABLE_LABELS: Record<string, string> = {
  comprobantes: 'Comprobante',
  lineas_comprobante: 'Línea',
};

function AuditEntryItem({ entry }: { entry: AuditoriaEntry }): React.JSX.Element {
  const diffs = formatearDiffAuditoria(entry.operation, entry.rowOld, entry.rowNew);

  return (
    <li className="border rounded-md bg-card p-3 space-y-2 text-sm">
      {/* Header de la entrada */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-normal text-xs">
          {TABLE_LABELS[entry.tableName] ?? entry.tableName}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            'font-normal text-xs',
            entry.operation === 'INSERT' &&
              'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900',
            entry.operation === 'DELETE' &&
              'text-destructive border-destructive/40 bg-destructive/10',
            entry.operation === 'UPDATE' &&
              'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900',
          )}
        >
          {OPERATION_LABELS[entry.operation] ?? entry.operation}
        </Badge>
        {entry.fueDuranteReapertura && (
          <Badge
            variant="outline"
            className="font-normal text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900"
          >
            Reapertura
          </Badge>
        )}
        <span
          className="text-xs text-muted-foreground ml-auto"
          title={formatearTimestamp(entry.ts)}
        >
          {timeAgo(entry.ts)}
        </span>
      </div>

      {/* Metadatos de la entrada */}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {entry.userId !== null && <p>Usuario: {entry.userId}</p>}
        {entry.motivo !== null && entry.motivo !== '' && (
          <p>Motivo: <span className="text-foreground italic">"{entry.motivo}"</span></p>
        )}
        <p className="tabular-nums">{formatearTimestamp(entry.ts)}</p>
      </div>

      {/* Diff de cambios */}
      {diffs.length > 0 && (
        <div className="space-y-1">
          {diffs.map((d, i) => {
            if (d.tipo === 'creado') {
              return (
                <details key={i} className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Ver datos creados
                  </summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(d.row, null, 2).slice(0, 500)}
                  </pre>
                </details>
              );
            }
            if (d.tipo === 'eliminado') {
              return (
                <details key={i} className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Ver datos eliminados
                  </summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(d.row, null, 2).slice(0, 500)}
                  </pre>
                </details>
              );
            }
            // d.tipo === 'campo'
            const antesStr = String(d.antes).slice(0, 80);
            const despuesStr = String(d.despues).slice(0, 80);
            return (
              <p key={i} className="text-xs">
                <span className="font-mono text-muted-foreground">{d.campo}</span>
                {': '}
                <span className="line-through text-destructive/70">{antesStr}</span>
                {' → '}
                <span className="text-green-700 dark:text-green-400">{despuesStr}</span>
              </p>
            );
          })}
        </div>
      )}
    </li>
  );
}

function AuditSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * Sheet lateral de historial de auditoría del comprobante.
 * Usa `useAuditoria` con `enabled: comprobanteId !== null` para no fetchear
 * cuando está cerrado.
 *
 * Muestra las entradas en orden cronológico DESCENDENTE (más reciente arriba).
 * Por cada entrada: badges de tabla/operación, timestamp en La_Paz, userId,
 * motivo y diff de cambios via `formatearDiffAuditoria`.
 * Badge "Reapertura" (ámbar) si `fueDuranteReapertura = true`.
 */
export function AuditoriaSheet({
  comprobanteId,
  onOpenChange,
}: AuditoriaSheetProps): React.JSX.Element {
  const { data: entries, isLoading, isError } = useAuditoria(comprobanteId);

  const isOpen = comprobanteId !== null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Historial de auditoría</SheetTitle>
          <SheetDescription>
            Todos los cambios registrados para este comprobante y sus líneas,
            más recientes primero.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-4">
          {isLoading && <AuditSkeleton />}

          {isError && (
            <p className="text-sm text-destructive">
              No se pudo cargar el historial de auditoría. Intentá de nuevo.
            </p>
          )}

          {!isLoading && !isError && entries !== undefined && entries.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                No hay entradas de auditoría para este comprobante.
              </p>
            </div>
          )}

          {!isLoading && !isError && entries !== undefined && entries.length > 0 && (
            <ul className="space-y-3">
              {/* Orden DESCENDENTE: más reciente primero */}
              {[...entries].reverse().map((entry) => (
                <AuditEntryItem key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
