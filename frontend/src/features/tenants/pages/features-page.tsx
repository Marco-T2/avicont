import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import { FeatureFlagRow } from '@/features/feature-flags/components/feature-flag-row';
import { useFeatureFlagList } from '@/features/feature-flags/hooks/use-feature-flags';

// /settings/features — toggles de módulos y banderas por tenant. El backend
// maneja dos capas: flags globales (ej. "contabilidad_features") y overrides
// por tenant. Acá mostramos todo unido; el primer toggle sobre un global
// crea el override automáticamente.
export function FeaturesPage(): React.JSX.Element {
  const flagsQuery = useFeatureFlagList();

  if (flagsQuery.isError) {
    toast.error('No se pudieron cargar los módulos');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Módulos activos</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Activá o desactivá funcionalidades para esta organización. Los
          cambios se aplican a todos los miembros inmediatamente.
        </p>
      </div>

      {flagsQuery.isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : null}

      {flagsQuery.data !== undefined ? (
        <FlagsSections data={flagsQuery.data} />
      ) : null}
    </div>
  );
}

function FlagsSections({
  data,
}: {
  data: { global: import('@/types/api').FeatureFlag[]; overrides: import('@/types/api').FeatureFlag[] };
}): React.JSX.Element {
  const totalFlags = data.global.length + data.overrides.length;

  if (totalFlags === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay módulos configurables para esta organización.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.overrides.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Personalizados
          </h2>
          <div className="space-y-2">
            {data.overrides.map((flag) => (
              <FeatureFlagRow key={flag.id} flag={flag} hasOverride={true} />
            ))}
          </div>
        </section>
      ) : null}

      {data.global.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Heredados
          </h2>
          <div className="space-y-2">
            {data.global.map((flag) => (
              <FeatureFlagRow key={flag.id} flag={flag} hasOverride={false} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
