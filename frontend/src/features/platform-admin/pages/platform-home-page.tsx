/**
 * Landing del panel de plataforma (placeholder de PR-0).
 * Las pantallas reales (organizaciones, feature flags) llegan en PR-1..4.
 */
export function PlatformHomePage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Panel de plataforma</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Administración de organizaciones y feature flags de toda la plataforma.
        </p>
      </div>
    </div>
  );
}
