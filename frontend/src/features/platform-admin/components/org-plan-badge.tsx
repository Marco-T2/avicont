import { Badge } from '@/components/ui/badge';
import type { OrgPlan } from '@/types/api';

interface OrgPlanBadgeProps {
  plan: OrgPlan;
}

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

// Mapa de plan conocido → etiqueta en español + variante de color.
const PLAN_META: Record<OrgPlan, { label: string; variant: BadgeVariant }> = {
  FREE: { label: 'Free', variant: 'secondary' },
  PRO: { label: 'Pro', variant: 'default' },
};

/**
 * Badge de plan de organización con render defensivo (R6): un valor de plan
 * inesperado del backend se muestra crudo en un badge neutro, sin romper la tabla.
 */
export function OrgPlanBadge({ plan }: OrgPlanBadgeProps): React.JSX.Element {
  const meta = PLAN_META[plan];
  if (meta === undefined) {
    return <Badge variant="outline">{String(plan)}</Badge>;
  }
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
