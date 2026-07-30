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

// Cross-feature: clientes activos para elegir quién paga. pageSize 100 =
// límite del backend (LIST_MAX_PAGE_SIZE de listar-contactos.dto.ts). Si un
// tenant supera 100 clientes activos, migrar a server-side search con `q`.
import { useContactos } from '@/features/contactos/hooks/use-contactos';

interface ContactoComboboxProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Combobox buscable de clientes (esCliente=true, activos). Clon del patrón
 * CuentaAutocomplete de comprobantes; filtro client-side por razón social
 * y documento.
 */
export function ContactoCombobox({
  value,
  onChange,
  disabled = false,
  placeholder = 'Seleccionar cliente…',
}: ContactoComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useContactos({ esCliente: true, activo: true, pageSize: 100 });

  const contactos = useMemo(() => data?.items ?? [], [data]);

  const selected = useMemo(
    () => (value !== '' ? contactos.find((c) => c.id === value) : undefined),
    [contactos, value],
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
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            selected === undefined && 'text-muted-foreground',
          )}
        >
          <span className="truncate text-left min-w-0 flex-1">
            {selected !== undefined ? selected.razonSocial : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 min-w-[20rem] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <Command
          filter={(itemValue, search) => {
            const haystack = itemValue.toLowerCase();
            const needle = search.toLowerCase().trim();
            if (needle === '') return 1;
            return haystack.includes(needle) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar por razón social o documento…" />
          <CommandList>
            <CommandEmpty>No se encontraron clientes.</CommandEmpty>
            <CommandGroup heading={`Clientes activos (${contactos.length})`}>
              {contactos.map((contacto) => {
                const haystack = `${contacto.razonSocial} ${contacto.documento ?? ''}`;
                const isSelected = value === contacto.id;
                return (
                  <CommandItem
                    key={contacto.id}
                    value={haystack}
                    onSelect={() => {
                      onChange(contacto.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="line-clamp-2">{contacto.razonSocial}</span>
                    {contacto.documento !== null && (
                      <span className="font-mono text-xs ml-2 text-muted-foreground shrink-0">
                        {contacto.documento}
                      </span>
                    )}
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
