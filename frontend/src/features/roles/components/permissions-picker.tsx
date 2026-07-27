import { AlertTriangle, ChevronRight, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CatalogoAgrupado, PermisoCatalogado } from '@/types/api';

import {
  esAccionSensible,
  etiquetaAccion,
  etiquetaGrupo,
} from '../lib/etiquetas-permisos';

interface PermissionsPickerProps {
  catalogo: CatalogoAgrupado[] | undefined;
  loading?: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string;
  disabled?: boolean;
}

type Marca = 'todos' | 'algunos' | 'ninguno';

function marcar(keys: string[], seleccionados: Set<string>): Marca {
  if (keys.length === 0) return 'ninguno';
  const cuantos = keys.filter((k) => seleccionados.has(k)).length;
  if (cuantos === 0) return 'ninguno';
  return cuantos === keys.length ? 'todos' : 'algunos';
}

function coincide(permiso: PermisoCatalogado, consulta: string): boolean {
  if (consulta === '') return true;
  const aguja = consulta.toLowerCase();
  return (
    permiso.key.toLowerCase().includes(aguja) ||
    permiso.descripcion.toLowerCase().includes(aguja) ||
    etiquetaAccion(permiso.accion).toLowerCase().includes(aguja) ||
    etiquetaGrupo(permiso.submodulo).toLowerCase().includes(aguja)
  );
}

// Árbol de permisos agrupado por módulo → submódulo → acción.
//
// El catálogo real son ~68 permisos en 21 submódulos. Renderizarlos todos a la
// vez, con la descripción completa de cada uno, daba un muro de texto que nadie
// lee. Tres decisiones lo evitan:
//
//   - COLAPSADO por defecto salvo el primer módulo. Lo que se ve al entrar es
//     un índice de 3 líneas, no 68 checkboxes.
//   - El hijo es SÓLO el verbo (`Ver`, `Crear`, `Anular`): el sustantivo ya lo
//     da el submódulo que lo agrupa. La descripción del backend queda en el
//     `title`.
//   - Cabeceras tri-state con cascada, que reemplazan a los 21 botones de
//     "Seleccionar todos" que antes ocupaban una línea cada uno.
//
// El buscador expande automáticamente los grupos con coincidencias: filtrar y
// dejar el resultado escondido detrás de un acordeón cerrado sería peor que no
// filtrar.
//
// No resuelve wildcards (`modulo.*`): si un rol los usa, hay que expandirlos.
export function PermissionsPicker({
  catalogo,
  loading = false,
  selected,
  onChange,
  error,
  disabled = false,
}: PermissionsPickerProps): React.JSX.Element {
  const [consulta, setConsulta] = useState('');
  // Preferencia EXPLÍCITA del usuario por módulo. Clave ausente = "sin
  // preferencia" ⇒ abierto sólo el primero. Mismo patrón que `openGroups` del
  // sidebar: guardar la preferencia y no el estado permite que un módulo nuevo
  // del catálogo herede el default sin sembrar nada.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const selectedSet = useMemo(() => new Set(selected), [selected]);

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

  // Recibe el estado ACTUAL en vez de leerlo del mapa: con la clave ausente
  // (default por posición) un `!abiertos[modulo]` daría siempre `true` y el
  // primer click sobre el módulo ya desplegado no haría nada visible.
  function alternarModulo(modulo: string, abiertoAhora: boolean): void {
    setAbiertos({ ...abiertos, [modulo]: !abiertoAhora });
  }

  function alternarPermiso(key: string): void {
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  }

  // Recibe SIEMPRE los permisos ya filtrados por la búsqueda. Operar sobre el
  // grupo completo mientras hay una consulta activa marcaría permisos que el
  // usuario no tiene a la vista — el peor tipo de efecto: invisible.
  function alternarGrupo(permisos: PermisoCatalogado[]): void {
    const keys = permisos.map((p) => p.key);
    const next = new Set(selectedSet);
    if (marcar(keys, selectedSet) === 'todos') {
      keys.forEach((k) => next.delete(k));
    } else {
      keys.forEach((k) => next.add(k));
    }
    onChange(Array.from(next));
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
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
    <div className="space-y-3">
      {error !== undefined ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar permiso…"
            aria-label="Buscar permiso"
            className="h-11 pl-8 pr-9 pointer-coarse:pr-12 text-base md:h-9 md:text-sm"
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
        <p className="shrink-0 text-xs text-muted-foreground">
          {consulta === ''
            ? `${selected.length} de ${totalPermisos}`
            : `${totalVisibles} coinciden`}
        </p>
      </div>

      {catalogoVisible.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Ningún permiso coincide con «{consulta}».
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        {catalogoVisible.map((mod, indice) => {
          const permisosModulo = mod.submodulos.flatMap((s) => s.permisos);
          const keysModulo = permisosModulo.map((p) => p.key);
          const marcaModulo = marcar(keysModulo, selectedSet);
          const elegidos = keysModulo.filter((k) => selectedSet.has(k)).length;
          // Con una búsqueda activa se abren todos los que tienen coincidencias:
          // filtrar y dejar el resultado detrás de un acordeón cerrado sería
          // peor que no filtrar.
          const abierto =
            consulta !== '' || (abiertos[mod.modulo] ?? indice === 0);

          return (
            <section key={mod.modulo} className="rounded-md border bg-card">
              {/* `relative` en todo contenedor de Checkbox: dentro de un <form>
                  Radix monta un <input> oculto `absolute` por control, y sin
                  ancestro posicionado su bloque contenedor es el documento —
                  escapan al `overflow-hidden` del shell (que es `static`) y
                  estiran el <html>, agregando una segunda barra de scroll. */}
              <div className="relative flex items-center gap-2 px-3 py-2">
                <Checkbox
                  aria-label={`Seleccionar todo ${etiquetaGrupo(mod.modulo)}`}
                  checked={
                    marcaModulo === 'algunos'
                      ? 'indeterminate'
                      : marcaModulo === 'todos'
                  }
                  disabled={disabled}
                  onCheckedChange={() => alternarGrupo(permisosModulo)}
                />
                <button
                  type="button"
                  onClick={() => alternarModulo(mod.modulo, abierto)}
                  aria-expanded={abierto}
                  className="flex pointer-coarse:min-h-11 flex-1 items-center gap-2 text-left"
                >
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      abierto && 'rotate-90',
                    )}
                  />
                  <span className="text-sm font-semibold">
                    {etiquetaGrupo(mod.modulo)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {elegidos} de {keysModulo.length}
                  </span>
                </button>
              </div>

              {abierto ? (
                <div className="divide-y border-t">
                  {mod.submodulos.map((sub) => {
                    const keysSub = sub.permisos.map((p) => p.key);
                    const marcaSub = marcar(keysSub, selectedSet);

                    return (
                      <div
                        key={`${mod.modulo}.${sub.submodulo}`}
                        className="flex flex-col gap-x-3 px-3 py-1.5 sm:flex-row sm:items-center"
                      >
                        <div className="relative flex pointer-coarse:min-h-11 items-center gap-2 sm:w-48 sm:shrink-0">
                          <Checkbox
                            aria-label={`Seleccionar todo ${etiquetaGrupo(sub.submodulo)}`}
                            checked={
                              marcaSub === 'algunos'
                                ? 'indeterminate'
                                : marcaSub === 'todos'
                            }
                            disabled={disabled}
                            onCheckedChange={() => alternarGrupo(sub.permisos)}
                          />
                          <span className="truncate text-xs text-muted-foreground">
                            {etiquetaGrupo(sub.submodulo)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3">
                          {sub.permisos.map((p) => {
                            const id = `perm-${p.key}`;
                            const sensible = esAccionSensible(p.accion);
                            return (
                              <label
                                key={p.key}
                                htmlFor={id}
                                title={`${p.descripcion} · ${p.key}`}
                                className="relative flex min-h-8 pointer-coarse:min-h-11 cursor-pointer items-center gap-1.5 rounded-sm px-1 hover:bg-accent"
                              >
                                <Checkbox
                                  id={id}
                                  checked={selectedSet.has(p.key)}
                                  disabled={disabled}
                                  onCheckedChange={() => alternarPermiso(p.key)}
                                />
                                {sensible ? (
                                  <AlertTriangle
                                    aria-hidden
                                    className="h-3 w-3 shrink-0 text-muted-foreground"
                                  />
                                ) : null}
                                <span className="text-xs">
                                  {etiquetaAccion(p.accion)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
