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
import type { Item } from '@/types/api';

// Cross-feature: el catálogo de ítems es la fuente de las líneas de venta
// (REQ-VTA-02, FK viva itemId). Se importa SOLO el hook (fachada pública de
// la feature items, §14.6). pageSize 100 = tope del backend
// (ListarItemsQueryDto @Max(LIST_MAX_PAGE_SIZE=100)) con filtro client-side —
// misma deuda que CuentaAutocomplete: si un tenant supera 100 ítems activos,
// migrar a server-side search con el param `q`.
import { useItems } from '@/features/items/hooks/use-items';

interface ItemAutocompleteProps {
  /** Id del ítem seleccionado, '' si ninguno. */
  value: string;
  /** Emite el ÍTEM COMPLETO: el caller precarga descripción/precio/cantidad. */
  onSelect: (item: Item) => void;
  disabled?: boolean;
}

/**
 * Combobox buscable de ítems ACTIVOS del catálogo. Emite el objeto completo
 * para que la fila precargue los snapshots (descripción, precio sugerido,
 * cantidad por defecto) — el usuario después los puede pisar (D-28).
 */
export function ItemAutocomplete({
  value,
  onSelect,
  disabled = false,
}: ItemAutocompleteProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  // Solo activos: un ítem desactivado no genera ventas nuevas (el backend lo
  // rechazaría con VENTA_ITEM_INACTIVO). Backend default = solo activos.
  const { data, isLoading } = useItems({ pageSize: 100 });

  const items: Item[] = useMemo(() => data?.items ?? [], [data]);

  const selected = useMemo(
    () => (value !== '' ? items.find((i) => i.id === value) : undefined),
    [items, value],
  );

  if (isLoading) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className="w-full justify-between font-normal text-muted-foreground"
      >
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
          aria-label="Ítem"
          disabled={disabled}
          {...(selected !== undefined ? { title: selected.nombre } : {})}
          className={cn(
            'w-full justify-between font-normal',
            selected === undefined && 'text-muted-foreground',
          )}
        >
          <span className="truncate text-left min-w-0 flex-1">
            {selected !== undefined ? selected.nombre : 'Elegir ítem…'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 min-w-[18rem] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <Command
          // Filtrado custom: busca en código Y nombre concatenados.
          filter={(itemValue, search) => {
            const needle = search.toLowerCase().trim();
            if (needle === '') return 1;
            return itemValue.toLowerCase().includes(needle) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar por código o nombre…" />
          <CommandList>
            <CommandEmpty>No se encontraron ítems.</CommandEmpty>
            <CommandGroup heading={`Ítems del catálogo (${items.length})`}>
              {items.map((item) => {
                const haystack = `${item.codigo ?? ''} ${item.nombre}`;
                const isSelected = value === item.id;
                return (
                  <CommandItem
                    key={item.id}
                    value={haystack}
                    onSelect={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {item.codigo !== null ? (
                      <span className="font-mono text-xs mr-2 text-muted-foreground shrink-0">
                        {item.codigo}
                      </span>
                    ) : null}
                    <span className="line-clamp-2">{item.nombre}</span>
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
