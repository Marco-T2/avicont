/**
 * Página del informe de conciliación bancaria (task 3.9: ruta + plumbing).
 *
 * Por ahora renderiza el header canónico y el empty state de emisión: la vista
 * del puente como papel de trabajo (task 3.10) y la declaración de arranque con
 * su historial (task 3.11) se montan sobre esta página consumiendo los hooks de
 * la feature (`useInformeConciliacion`, `useHistorialArranques`,
 * `useDeclararArranque`).
 */
export function InformeConciliacionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Informe de conciliación</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Saldo según extracto ± partidas = saldo según libros: el puente entre el banco y los
          libros a una fecha de corte.
        </p>
      </div>

      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          Elegí una cuenta bancaria y una fecha de corte para emitir el informe.
        </p>
      </div>
    </div>
  );
}
