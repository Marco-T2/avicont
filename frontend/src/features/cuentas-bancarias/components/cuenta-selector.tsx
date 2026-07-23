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

// Cross-feature: cuentas de detalle activas para vincular una cuenta bancaria
// (REQ-CB-01: esDetalle=true AND activa=true, elegida por el usuario, NUNCA
// adivinada). pageSize 100 = límite del backend (ListarCuentasQueryDto @Max(100)).
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

interface CuentaSelectorProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/** Combobox buscable para elegir la cuenta del plan a vincular (REQ-CB-01). */
export function CuentaSelector({
  value,
  onChange,
  disabled = false,
}: CuentaSelectorProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useCuentas({ esDetalle: true, activa: true, pageSize: 100 });
  const cuentas: Cuenta[] = useMemo(() => data?.items ?? [], [data]);

  const selected = useMemo(
    () => (value !== '' ? cuentas.find((c) => c.id === value) : undefined),
    [cuentas, value],
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
            {selected !== undefined ? (
              <>
                {selected.nombre}
                <span className="font-mono text-xs ml-2 text-muted-foreground">
                  {selected.codigoInterno}
                </span>
              </>
            ) : (
              'Seleccionar cuenta…'
            )}
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
          <CommandInput placeholder="Buscar por código o nombre…" />
          <CommandList>
            <CommandEmpty>No se encontraron cuentas de detalle activas.</CommandEmpty>
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
