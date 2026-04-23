import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { backendErrorMessage } from '@/lib/error-messages';
import type { FeatureFlag } from '@/types/api';

import { useSetFeatureFlag } from '../hooks/use-feature-flags';

interface FeatureFlagRowProps {
  flag: FeatureFlag;
  // Si este flag ya tiene un override en el tenant (vs inherit global).
  hasOverride: boolean;
}

export function FeatureFlagRow({
  flag,
  hasOverride,
}: FeatureFlagRowProps): React.JSX.Element {
  const mutation = useSetFeatureFlag();

  function handleToggle(next: boolean): void {
    mutation.mutate(
      { flag, enabled: next, hasOverride },
      {
        onSuccess: () => {
          toast.success(
            `"${flag.name}" ${next ? 'activado' : 'desactivado'}`,
          );
        },
        onError: (err) => {
          toast.error(
            backendErrorMessage(err, 'No se pudo actualizar el flag'),
          );
        },
      },
    );
  }

  const switchId = `flag-${flag.key}`;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <label htmlFor={switchId} className="cursor-pointer font-medium">
            {flag.name}
          </label>
          {hasOverride ? (
            <Badge variant="outline" className="text-[10px]">
              personalizado
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              heredado
            </Badge>
          )}
        </div>
        {flag.description !== null ? (
          <p className="text-sm text-muted-foreground">{flag.description}</p>
        ) : null}
        <code className="text-xs text-muted-foreground/80">{flag.key}</code>
      </div>
      <Switch
        id={switchId}
        checked={flag.enabled}
        disabled={mutation.isPending}
        onCheckedChange={handleToggle}
        aria-label={`${flag.enabled ? 'Desactivar' : 'Activar'} ${flag.name}`}
      />
    </div>
  );
}
