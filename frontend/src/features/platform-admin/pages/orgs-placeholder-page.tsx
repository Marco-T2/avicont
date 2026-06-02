/**
 * Placeholder de la lista de organizaciones (PR-0). La pantalla real (tabla,
 * badges, crear org) llega en PR-1. Se reemplaza al conectar OrgsPage.
 */
export function OrgsPlaceholderPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Organizaciones</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Próximamente: listado y administración de organizaciones.
        </p>
      </div>
    </div>
  );
}
