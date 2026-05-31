import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Cuenta } from '@/types/api';

/**
 * Cross-feature import justificado: importamos de `hooks/` (fachada pública del módulo
 * plan-cuentas), no de `api/`. El hook encapsula la query de TanStack Query y es
 * la interfaz pública pensada para ser consumida por otros features (design obs 247).
 * Regla: componentes NO importan de `features/<x>/api/` de otra feature.
 */
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

interface CuentaAutocompleteProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Combobox buscable para elegir una cuenta de detalle activa.
 * Consume `useCuentas({ esDetalle: true, activa: true, pageSize: 100 })`.
 * Filtro client-side por código y nombre. pageSize 100 = límite del backend
 * (ListarCuentasQueryDto @Max(100)). Si un tenant supera 100 cuentas de
 * detalle, migrar a server-side search con el param `search`.
 *
 * Cross-feature: ver JSDoc del import arriba.
 */
export function CuentaAutocomplete({
  value,
  onChange,
  disabled = false,
  placeholder = 'Seleccionar cuenta…',
}: CuentaAutocompleteProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useCuentas({ esDetalle: true, activa: true, pageSize: 100 });

  const cuentas: Cuenta[] = useMemo(() => data?.items ?? [], [data]);

  const selected = useMemo(
    () => (value !== '' ? cuentas.find((c) => c.id === value) : undefined),
    [cuentas, value],
  );

  if (isLoading) {
    return (
      <Button type="button" variant="outline" disabled className="w-full justify-between font-normal text-muted-foreground">
        Cargando…
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          // Tooltip nativo: muestra código + nombre completos al pasar el mouse,
          // ya que el nombre se trunca en la celda fija de la tabla de líneas.
          {...(selected !== undefined
            ? { title: `${selected.codigoInterno} · ${selected.nombre}` }
            : {})}
          className={cn(
            'w-full justify-between font-normal',
            selected === undefined && 'text-muted-foreground',
          )}
        >
          <span className="truncate text-left min-w-0 flex-1">
            {selected !== undefined ? (
              <>
                {/* El dominio habla el idioma del negocio: el contador lee el
                    nombre, no el código. El nombre va primero y, si algo se
                    trunca, se trunca el código (que el tooltip completa). */}
                {selected.nombre}
                <span className="font-mono text-xs ml-2 text-muted-foreground">
                  {selected.codigoInterno}
                </span>
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        // Ancho mínimo propio (no hereda el del trigger): en celdas/filtros
        // angostos el trigger es chico, pero al elegir necesitamos leer el
        // nombre completo. min-w-[20rem] da aire; max-w evita desbordar mobile.
        className="p-0 min-w-[20rem] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <Command
          // Filtrado custom: busca en código Y nombre concatenados.
          // cmdk matchea contra el `value` del CommandItem; pasamos
          // `${codigoInterno} ${nombre}` como haystack.
          filter={(itemValue, search) => {
            const haystack = itemValue.toLowerCase();
            const needle = search.toLowerCase().trim();
            if (needle === '') return 1;
            return haystack.includes(needle) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar por código o nombre…" />
          <CommandList>
            <CommandEmpty>No se encontraron cuentas.</CommandEmpty>
            <CommandGroup heading={`Cuentas de detalle (${cuentas.length})`}>
              {cuentas.map((cuenta) => {
                const haystack = `${cuenta.codigoInterno} ${cuenta.nombre}`;
                const isSelected = value === cuenta.id;
                return (
                  <CommandItem
                    key={cuenta.id}
                    value={haystack}
                    onSelect={() => {
                      onChange(cuenta.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="font-mono text-xs mr-2 text-muted-foreground shrink-0">
                      {cuenta.codigoInterno}
                    </span>
                    {/* line-clamp-2: el nombre envuelve hasta 2 líneas en vez
                        de truncarse — el usuario lee el nombre completo al elegir. */}
                    <span className="line-clamp-2">{cuenta.nombre}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
