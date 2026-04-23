import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type ClaseCuenta } from '@/types/api';

// Colores semánticos del dominio contable (estándar internacional informal:
// activos azul, pasivos rojo, patrimonio púrpura, ingreso verde, egreso
// naranja). Son colores SEMÁNTICOS, no decorativos — la regla §6 del
// CLAUDE.md admite colores fuera del tema cuando codifican información
// de dominio. Usamos escalas Tailwind con /10 opacity + text-*-700 light
// y text-*-300 dark para mantener contraste en ambos modos.
//
// TODO: migrar a variables del tema (--clase-activo, --clase-pasivo, …)
// cuando el sistema crezca y haya más paletas semánticas.
const CLASE_STYLES: Record<ClaseCuenta, { label: string; className: string }> = {
  ACTIVO: {
    label: 'Activo',
    className:
      'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300 dark:border-blue-400/40',
  },
  PASIVO: {
    label: 'Pasivo',
    className:
      'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300 dark:border-red-400/40',
  },
  PATRIMONIO: {
    label: 'Patrimonio',
    className:
      'bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300 dark:border-purple-400/40',
  },
  INGRESO: {
    label: 'Ingreso',
    className:
      'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-300 dark:border-green-400/40',
  },
  EGRESO: {
    label: 'Egreso',
    className:
      'bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300 dark:border-orange-400/40',
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
