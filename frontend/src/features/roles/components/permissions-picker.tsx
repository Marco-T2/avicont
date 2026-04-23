import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogoAgrupado, PermisoCatalogado } from '@/types/api';

interface PermissionsPickerProps {
  catalogo: CatalogoAgrupado[] | undefined;
  loading?: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string;
}

// Picker plano (sin accordion) agrupado por módulo → submódulo. Cada submódulo
// tiene su propio "Seleccionar todos" para acelerar. No intenta resolver
// wildcards (`modulo.*`): si el rol los usa, hay que expandirlos o dejar el
// wildcard como entrada manual futura.
export function PermissionsPicker({
  catalogo,
  loading = false,
  selected,
  onChange,
  error,
}: PermissionsPickerProps): React.JSX.Element {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function togglePermission(key: string): void {
    const next = new Set(selectedSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(Array.from(next));
  }

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
        <p className="text-xs text-destructive">{error}</p>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {selected.length} permiso{selected.length === 1 ? '' : 's'} seleccionado
          {selected.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-4">
        {catalogo.map((mod) => (
          <section
            key={mod.modulo}
            className="rounded-md border bg-card p-4 space-y-3"
          >
            <header className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide">
                {mod.modulo}
              </h3>
            </header>

            <div className="space-y-3">
              {mod.submodulos.map((sub) => {
                const allKeys = sub.permisos.map((p) => p.key);
                const allSelected =
                  allKeys.length > 0 &&
                  allKeys.every((k) => selectedSet.has(k));
                const someSelected = allKeys.some((k) => selectedSet.has(k));

                return (
                  <div
                    key={`${mod.modulo}.${sub.submodulo}`}
                    className="space-y-2 rounded-md border bg-background p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {sub.submodulo}
                        </span>
                        {someSelected && !allSelected ? (
                          <Badge variant="outline" className="text-[10px]">
                            parcial
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toggleGroup(sub.permisos)}
                      >
                        {allSelected ? 'Quitar todos' : 'Seleccionar todos'}
                      </Button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {sub.permisos.map((p) => {
                        const checkboxId = `perm-${p.key}`;
                        return (
                          <label
                            key={p.key}
                            htmlFor={checkboxId}
                            className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1 hover:bg-accent"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={selectedSet.has(p.key)}
                              onCheckedChange={() => togglePermission(p.key)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 text-xs leading-tight">
                              <div className="font-medium">{p.accion}</div>
                              <div className="text-muted-foreground">
                                {p.descripcion}
                              </div>
                              <code className="text-[10px] text-muted-foreground/80">
                                {p.key}
                              </code>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
