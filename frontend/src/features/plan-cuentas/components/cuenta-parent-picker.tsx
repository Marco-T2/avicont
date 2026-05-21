import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { type ClaseCuenta, type CuentaTreeNode } from '@/types/api';

interface CuentaParentPickerProps {
  agrupadores: CuentaTreeNode[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  /** Si se provee, filtra los agrupadores a esa sola clase (el árbol no cruza clases). */
  filterByClase?: ClaseCuenta;
  disabled?: boolean;
  placeholder?: string;
}

// Combobox buscable para elegir Cuenta Padre. Reemplaza el Select plano
// cuando hay muchos agrupadores y el usuario necesita filtrar por texto
// (código o nombre) además de por clase contable.
//
// Filtrado por clase: cuando el form tiene clase = "ACTIVO", solo mostramos
// agrupadores de clase ACTIVO. Regla del plan de cuentas: el árbol no cruza
// clases (no hay cuenta pasivo bajo un padre activo).
export function CuentaParentPicker({
  agrupadores,
  value,
  onChange,
  filterByClase,
  disabled = false,
  placeholder = '— sin padre (raíz) —',
}: CuentaParentPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (filterByClase === undefined) return agrupadores;
    return agrupadores.filter((a) => a.claseCuenta === filterByClase);
  }, [agrupadores, filterByClase]);

  const selected = useMemo(
    () => (value !== undefined ? filtered.find((a) => a.id === value) : undefined),
    [filtered, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            selected === undefined && 'text-muted-foreground',
          )}
        >
          <span className="truncate text-left">
            {selected !== undefined ? (
              <>
                <span className="font-mono text-xs mr-2 text-muted-foreground">
                  {selected.codigoInterno}
                </span>
                {selected.nombre}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <Command
          // Filtrado custom: buscar en código Y nombre (cmdk por default solo
          // matchea contra el `value` del Item).
          filter={(itemValue, search) => {
            const haystack = itemValue.toLowerCase();
            const needle = search.toLowerCase();
            return haystack.includes(needle) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar por código o nombre…" />
          <CommandList>
            <CommandEmpty>
              {filterByClase !== undefined
                ? `No hay agrupadores de clase ${filterByClase}.`
                : 'No se encontraron agrupadores.'}
            </CommandEmpty>

            {/* Opción especial "sin padre" — siempre visible primero para
                cuentas raíz (nivel 1). */}
            <CommandGroup>
              <CommandItem
                value="__none__ sin padre raíz"
                onSelect={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === undefined ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="italic">— sin padre (raíz) —</span>
              </CommandItem>
            </CommandGroup>
            {filtered.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Agrupadores${filterByClase !== undefined ? ` — ${filterByClase}` : ''} (${filtered.length})`}>
                  {filtered.map((ag) => {
                    // Construimos el "haystack" del item para que cmdk matchee
                    // tanto por código como por nombre cuando el user escribe.
                    const haystack = `${ag.codigoInterno} ${ag.nombre}`;
                    const isSelected = value === ag.id;
                    return (
                      <CommandItem
                        key={ag.id}
                        value={haystack}
                        onSelect={() => {
                          onChange(ag.id);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            isSelected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="font-mono text-xs mr-2 text-muted-foreground">
                          {ag.codigoInterno}
                        </span>
                        <span className="truncate">{ag.nombre}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Variante helper — botón de "limpiar" cuando hay selección, montable al
// lado del picker si el consumidor lo quiere. Hoy no lo usamos porque
// el picker ya ofrece la opción "— sin padre —" adentro.
export function CuentaParentClearButton({
  onClear,
  disabled,
}: {
  onClear: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Quitar cuenta padre"
      onClick={onClear}
      disabled={disabled}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
