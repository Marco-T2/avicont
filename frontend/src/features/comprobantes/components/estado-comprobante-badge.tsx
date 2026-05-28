import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EstadoComprobante } from '@/types/api';

interface EstadoComprobanteBadgeProps {
  estado: EstadoComprobante;
  /** Si es true, ignora `estado` y muestra "Anulado" con line-through (CLAUDE.md §4.7). */
  anulado: boolean;
  className?: string;
}

/**
 * Badge visual del estado de un comprobante.
 * Cuando `anulado=true`, el estado se ignora — el badge siempre muestra "Anulado"
 * con strikethrough porque el flag `anulado` es ortogonal al estado (CLAUDE.md §4.7).
 */
export function EstadoComprobanteBadge({
  estado,
  anulado,
  className,
}: EstadoComprobanteBadgeProps): React.JSX.Element {
  if (anulado) {
    return (
      <Badge
        role="status"
        variant="outline"
        className={cn(
          'font-normal line-through',
          'text-destructive border-destructive/40 bg-destructive/10',
          className,
        )}
      >
        Anulado
      </Badge>
    );
  }

  if (estado === 'BORRADOR') {
    return (
      <Badge
        role="status"
        variant="secondary"
        className={cn('font-normal', className)}
      >
        Borrador
      </Badge>
    );
  }

  if (estado === 'CONTABILIZADO') {
    return (
      <Badge
        role="status"
        variant="outline"
        className={cn(
          'font-normal',
          'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900',
          className,
        )}
      >
        Contabilizado
      </Badge>
    );
  }

  // BLOQUEADO → "Cerrado" (terminología user-facing del contador boliviano)
  return (
    <Badge
      role="status"
      variant="outline"
      className={cn(
        'font-normal',
        'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900',
        className,
      )}
    >
      Cerrado
    </Badge>
  );
}
