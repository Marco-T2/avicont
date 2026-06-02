import { Badge } from '@/components/ui/badge';
import type { OrgStatus } from '@/types/api';

interface OrgStatusBadgeProps {
  status: OrgStatus;
}

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

// Mapa de status conocido → etiqueta en español + variante de color.
const STATUS_META: Record<OrgStatus, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Activa', variant: 'default' },
  SUSPENDED: { label: 'Suspendida', variant: 'destructive' },
  ARCHIVED: { label: 'Archivada', variant: 'secondary' },
};

/**
 * Badge de status de organización con render defensivo (R6): el backend tipa
 * status como string, así que un valor nuevo se muestra crudo en un badge neutro
 * en lugar de romper la tabla.
 */
export function OrgStatusBadge({ status }: OrgStatusBadgeProps): React.JSX.Element {
  const meta = STATUS_META[status];
  if (meta === undefined) {
    return <Badge variant="outline">{String(status)}</Badge>;
  }
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
