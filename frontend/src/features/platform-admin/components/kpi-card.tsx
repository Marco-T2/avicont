import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  /** Título descriptivo del KPI (ej. "Organizaciones activas"). */
  title: string;
  /** Valor principal del KPI. */
  value: number;
  /** Etiqueta que describe la unidad del valor (opcional). */
  label?: string;
  /** Clase CSS adicional para el card. */
  className?: string;
}

/**
 * Card individual de KPI. Presentacional puro — recibe datos vía props.
 */
export function KpiCard({ title, value, label, className }: KpiCardProps): React.JSX.Element {
  return (
    <Card size="sm" className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums">{value.toLocaleString('es-BO')}</p>
        {label !== undefined && (
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        )}
      </CardContent>
    </Card>
  );
}
