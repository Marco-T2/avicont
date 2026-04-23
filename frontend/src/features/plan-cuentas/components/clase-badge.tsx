import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type ClaseCuenta } from '@/types/api';

// Colores semánticos del dominio contable — ahora a través de las variables
// del tema (src/index.css --clase-{activo,pasivo,patrimonio,ingreso,egreso}-{fg,bg}).
// Light/dark resueltos automáticamente por las variables. WCAG AA sobre
// ambos fondos. Cumple CLAUDE.md §6: cero colores literales.
const CLASE_STYLES: Record<ClaseCuenta, { label: string; className: string }> = {
  ACTIVO: {
    label: 'Activo',
    className: 'bg-clase-activo-bg text-clase-activo-fg border-clase-activo-fg/30',
  },
  PASIVO: {
    label: 'Pasivo',
    className: 'bg-clase-pasivo-bg text-clase-pasivo-fg border-clase-pasivo-fg/30',
  },
  PATRIMONIO: {
    label: 'Patrimonio',
    className:
      'bg-clase-patrimonio-bg text-clase-patrimonio-fg border-clase-patrimonio-fg/30',
  },
  INGRESO: {
    label: 'Ingreso',
    className: 'bg-clase-ingreso-bg text-clase-ingreso-fg border-clase-ingreso-fg/30',
  },
  EGRESO: {
    label: 'Egreso',
    className: 'bg-clase-egreso-bg text-clase-egreso-fg border-clase-egreso-fg/30',
  },
};

interface ClaseBadgeProps {
  clase: ClaseCuenta;
  className?: string;
}

export function ClaseBadge({ clase, className }: ClaseBadgeProps): React.JSX.Element {
  const { label, className: claseStyle } = CLASE_STYLES[clase];
  return (
    <Badge variant="outline" className={cn('font-normal', claseStyle, className)}>
      {label}
    </Badge>
  );
}
