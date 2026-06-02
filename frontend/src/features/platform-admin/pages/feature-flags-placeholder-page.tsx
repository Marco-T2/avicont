/**
 * Placeholder de feature flags globales (PR-0). La pantalla real llega en PR-4.
 */
export function FeatureFlagsPlaceholderPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Feature flags</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Próximamente: gestión de feature flags globales.
        </p>
      </div>
    </div>
  );
}
