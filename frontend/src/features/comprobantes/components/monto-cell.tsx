import { cn } from '@/lib/utils';

interface MontoCellProps {
  monto: string;
  moneda?: 'BOB' | 'USD';
  className?: string;
}

/**
 * Celda de monto numérico con tipografía monoespaciada y alineación tabular.
 * Prefija "Bs" para BOB y "$" para USD.
 *
 * Formato: `font-mono tabular-nums` para que los montos se alineen verticalmente
 * en tablas (CLAUDE.md §4.5 — decimales llegan como string desde el backend).
 */
export function MontoCell({
  monto,
  moneda = 'BOB',
  className,
}: MontoCellProps): React.JSX.Element {
  const prefijo = moneda === 'BOB' ? 'Bs' : '$';

  return (
    <span
      className={cn('font-mono tabular-nums', className)}
    >
      <span className="text-muted-foreground text-xs mr-0.5">{prefijo}</span>
      {monto}
    </span>
  );
}
