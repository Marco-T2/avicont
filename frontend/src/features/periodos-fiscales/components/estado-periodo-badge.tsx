import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PeriodoFiscalStatus } from '@/types/api';

interface EstadoPeriodoBadgeProps {
  status: PeriodoFiscalStatus;
  conBorradores?: boolean;
  className?: string;
}

export function EstadoPeriodoBadge({
  status,
  conBorradores = false,
  className,
}: EstadoPeriodoBadgeProps): React.JSX.Element {
  if (status === 'CERRADO') {
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

  if (conBorradores) {
    return (
      <Badge
        role="status"
        variant="outline"
        className={cn(
          'font-normal',
          'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
          className,
        )}
      >
        Abierto · con borradores
      </Badge>
    );
  }

  return (
    <Badge role="status" variant="secondary" className={cn('font-normal', className)}>
      Abierto
    </Badge>
  );
}
