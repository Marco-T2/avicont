import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogoAgrupado, PermisoCatalogado } from '@/types/api';

interface PermissionsPickerProps {
  catalogo: CatalogoAgrupado[] | undefined;
  loading?: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string;
}

// Los nombres del catálogo son slugs sin tildes (`organizacion`, `periodos`),
// porque son identificadores. Acá son texto de UI en español (§1), así que los
// que llevan tilde o nombre propio se declaran; el resto se deriva.
//
// Un slug nuevo que no esté en el mapa cae en la derivación y se ve razonable —
// no rompe nada, sólo le falta la tilde si la necesitaba.
const ETIQUETAS: Record<string, string> = {
  organizacion: 'Organización',
  configuracion: 'Configuración',
  'feature-flags': 'Feature flags',
  'plan-cuentas': 'Plan de cuentas',
  'libro-diario': 'Libro diario',
  'libro-mayor': 'Libro mayor',
  periodos: 'Períodos fiscales',
  'cierre-mensual': 'Cierre mensual',
  eeff: 'Estados financieros',
  'tipos-documento-fisico': 'Tipos de documento físico',
  'documentos-fisicos': 'Documentos físicos',
  conciliacion: 'Conciliación',
  'tipos-registro': 'Tipos de registro',
};

function etiquetar(slug: string): string {
  const declarada = ETIQUETAS[slug];
  if (declarada !== undefined) return declarada;
  const conEspacios = slug.replace(/-/g, ' ');
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1);
}

function coincide(permiso: PermisoCatalogado, consulta: string): boolean {
  if (consulta === '') return true;
  const aguja = consulta.toLowerCase();
  return (
    permiso.key.toLowerCase().includes(aguja) ||
    permiso.accion.toLowerCase().includes(aguja) ||
    permiso.descripcion.toLowerCase().includes(aguja) ||
    permiso.submodulo.toLowerCase().includes(aguja)
  );
}

// Picker agrupado por módulo → submódulo, pensado para una página completa (no
// para un modal): el catálogo real son ~68 permisos en 21 submódulos y no entra
// en una pantalla.
//
// Decisiones que bajan el alto, en orden de cuánto aportaron (medido):
//   - El submódulo es una FILA, no una tarjeta. Con 21 submódulos de 2-6
//     permisos cada uno, el borde + padding de cada tarjeta pesaba más que los
//     permisos que contenía.
//   - Un permiso es su descripción y nada más. La `key`
//     (`contabilidad.asientos.read`) es la concatenación literal de módulo +
//     submódulo + acción, y la acción ya abre la descripción ("Crear…",
//     "Modificar…"): mostrarlas era repetir dos veces lo mismo. La key completa
//     vive en el `title`.
//   - Buscador: con 68 permisos, encontrar uno scrolleando no es viable.
//
// No resuelve wildcards (`modulo.*`): si un rol los usa, hay que expandirlos.
export function PermissionsPicker({
  catalogo,
  loading = false,
  selected,
  onChange,
  error,
}: PermissionsPickerProps): React.JSX.Element {
  const [consulta, setConsulta] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // El filtrado descarta submódulos y módulos que quedan vacíos: una tarjeta de
  // submódulo sin permisos adentro es ruido que hace parecer que la búsqueda no
  // funcionó.
  const catalogoVisible = useMemo(() => {
    if (catalogo === undefined) return [];
    return catalogo
      .map((mod) => ({
        ...mod,
        submodulos: mod.submodulos
          .map((sub) => ({
            ...sub,
            permisos: sub.permisos.filter((p) => coincide(p, consulta)),
          }))
          .filter((sub) => sub.permisos.length > 0),
      }))
      .filter((mod) => mod.submodulos.length > 0);
  }, [catalogo, consulta]);

  const totalPermisos = useMemo(
    () =>
      (catalogo ?? []).reduce(
        (acc, mod) =>
          acc + mod.submodulos.reduce((a, s) => a + s.permisos.length, 0),
        0,
      ),
    [catalogo],
  );

  const totalVisibles = useMemo(
    () =>
      catalogoVisible.reduce(
        (acc, mod) =>
          acc + mod.submodulos.reduce((a, s) => a + s.permisos.length, 0),
        0,
      ),
    [catalogoVisible],
  );

  function togglePermission(key: string): void {
    const next = new Set(selectedSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(Array.from(next));
  }

  // Recibe SIEMPRE los permisos ya filtrados por la búsqueda. Operar sobre el
  // grupo completo mientras hay una consulta activa seleccionaría permisos que
  // el usuario no tiene a la vista — el peor tipo de efecto: invisible.
  function toggleGroup(permisos: PermisoCatalogado[]): void {
    const keys = permisos.map((p) => p.key);
    const allSelected = keys.every((k) => selectedSet.has(k));
    const next = new Set(selectedSet);
    if (allSelected) {
      keys.forEach((k) => next.delete(k));
    } else {
      keys.forEach((k) => next.add(k));
    }
    onChange(Array.from(next));
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (catalogo === undefined || catalogo.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay permisos disponibles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error !== undefined ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar permiso…"
            aria-label="Buscar permiso"
            className="h-11 pl-8 text-base md:h-9 md:text-sm"
          />
          {consulta !== '' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              onClick={() => setConsulta('')}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          {consulta === ''
            ? `${totalPermisos} permisos disponibles`
            : `${totalVisibles} de ${totalPermisos} coinciden`}
        </p>
      </div>

      {catalogoVisible.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Ningún permiso coincide con «{consulta}».
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {catalogoVisible.map((mod) => {
          const permisosModulo = mod.submodulos.flatMap((s) => s.permisos);
          const moduloCompleto = permisosModulo.every((p) =>
            selectedSet.has(p.key),
          );

          return (
            <section
              key={mod.modulo}
              className="overflow-hidden rounded-md border bg-card"
            >
              <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                  {etiquetar(mod.modulo)}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => toggleGroup(permisosModulo)}
                >
                  {moduloCompleto
                    ? 'Quitar todo el módulo'
                    : 'Seleccionar todo el módulo'}
                </Button>
              </header>

              <div className="divide-y">
                {mod.submodulos.map((sub) => {
                  const allKeys = sub.permisos.map((p) => p.key);
                  const allSelected = allKeys.every((k) => selectedSet.has(k));
                  const someSelected = allKeys.some((k) => selectedSet.has(k));

                  return (
                    <div
                      key={`${mod.modulo}.${sub.submodulo}`}
                      className="gap-x-4 px-4 py-2 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-baseline"
                    >
                      <div className="flex items-center gap-2 py-1">
                        <span className="min-w-0 truncate text-xs font-medium text-foreground">
                          {etiquetar(sub.submodulo)}
                        </span>
                        {someSelected && !allSelected ? (
                          <Badge variant="outline" className="text-[10px]">
                            parcial
                          </Badge>
                        ) : null}
                      </div>

                      {/* `flex-wrap` en vez de una grilla de columnas fijas: los
                          permisos de un submódulo son 2-6 y sus descripciones
                          tienen largos muy distintos, así que una grilla deja
                          columnas medio vacías y estira el alto.
                          Cada fila: 44px en mobile (§7), 32 en desktop — el
                          mismo par que usan los filtros de /comprobantes.

                          El `relative` del label NO es cosmético. Dentro de un
                          <form>, Radix monta por cada Checkbox un <input> oculto
                          `position:absolute` para que participe del submit. Sin
                          un ancestro posicionado, su bloque contenedor es el
                          documento: el `overflow-hidden` del DashboardShell es
                          `static` y no los recorta, así que los 68 estiraban el
                          <html> y aparecía una SEGUNDA barra de scroll al lado
                          de la del <main>. Medido: 1254px de scroll fantasma en
                          el <html>, 0 con esta clase. En el modal no pasaba
                          porque el DialogContent es `fixed` y sí los contenía. */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {sub.permisos.map((p) => {
                          const checkboxId = `perm-${p.key}`;
                          return (
                            <label
                              key={p.key}
                              htmlFor={checkboxId}
                              title={p.key}
                              className="relative flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-accent md:min-h-8"
                            >
                              <Checkbox
                                id={checkboxId}
                                checked={selectedSet.has(p.key)}
                                onCheckedChange={() => togglePermission(p.key)}
                              />
                              <span className="min-w-0 text-xs">
                                {p.descripcion}
                              </span>
                            </label>
                          );
                        })}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 text-xs text-muted-foreground"
                          onClick={() => toggleGroup(sub.permisos)}
                        >
                          {allSelected ? 'Quitar todos' : 'Seleccionar todos'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
