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
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';

// Cross-feature: contactos es la fuente de verdad del directorio de clientes/proveedores.
// pageSize: 50 para que el dropdown sea navegable sin scroll excesivo en la mayoría de tenants.
// Búsqueda server-side via GIN trigram (backend @contactos) con debounce 350 ms.
import { useContactos } from '@/features/contactos/hooks/use-contactos';

interface ContactoComboboxProps {
  /** Id del contacto seleccionado, o null si ninguno. */
  value: string | null;
  /** Emite el id del contacto al seleccionar, o null al limpiar. */
  onSelect: (contactoId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Marca el trigger como inválido (aviso blando de contacto faltante). */
  'aria-invalid'?: boolean;
  /** Label accesible para el trigger del combobox. */
  'aria-label'?: string;
}

/**
 * Combobox buscable para elegir un contacto (cliente/proveedor).
 * Búsqueda server-side con debounce 350 ms — usa el índice GIN trigram del backend.
 * Emite onSelect(id | null).
 */
export function ContactoCombobox({
  value,
  onSelect,
  disabled = false,
  placeholder = 'Seleccionar contacto…',
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: ContactoComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Debounce 350 ms para no disparar un request por cada tecla.
  const debouncedSearch = useDebouncedValue(search, 350);

  const { data, isLoading } = useContactos({
    q: debouncedSearch.length > 0 ? debouncedSearch : undefined,
    activo: true,
    pageSize: 50,
  });

  const contactos = useMemo(() => data?.items ?? [], [data]);

  const selected = useMemo(
    () => (value !== null ? contactos.find((c) => c.id === value) : undefined),
    [contactos, value],
  );

  // Si hay valor pero aún no cargaron los contactos, mostrar placeholder.
  const label =
    selected !== undefined
      ? selected.razonSocial
      : value !== null
        ? 'Cargando…'
        : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            value === null && 'text-muted-foreground',
            ariaInvalid === true && 'border-amber-400 dark:border-amber-600',
          )}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar contacto…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <CommandEmpty>Buscando…</CommandEmpty>
            ) : contactos.length === 0 ? (
              <CommandEmpty>No se encontraron contactos.</CommandEmpty>
            ) : (
              <CommandGroup>
                {value !== null ? (
                  <CommandItem
                    value="__limpiar__"
                    onSelect={() => {
                      onSelect(null);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <span className="text-muted-foreground">Ninguno (quitar contacto)</span>
                  </CommandItem>
                ) : null}
                {contactos.map((contacto) => {
                  const isSelected = value === contacto.id;
                  return (
                    <CommandItem
                      key={contacto.id}
                      value={contacto.id}
                      onSelect={() => {
                        onSelect(contacto.id);
                        setOpen(false);
                        setSearch('');
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="truncate">{contacto.razonSocial}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
