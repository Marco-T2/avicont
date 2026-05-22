import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type RolFiltro = 'todos' | 'clientes' | 'proveedores';

const ROLES: { value: RolFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'clientes', label: 'Clientes' },
  { value: 'proveedores', label: 'Proveedores' },
];

interface ContactoListFiltersProps {
  rol: RolFiltro;
  onRolChange: (rol: RolFiltro) => void;
  incluirInactivos: boolean;
  onIncluirInactivosChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function ContactoListFilters({
  rol,
  onRolChange,
  incluirInactivos,
  onIncluirInactivosChange,
  search,
  onSearchChange,
}: ContactoListFiltersProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre o NIT…"
          aria-label="Buscar contacto"
          className="pl-9 pr-9 text-base md:text-sm"
        />
        {search.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Limpiar búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => onSearchChange('')}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {ROLES.map(({ value, label }) => (
            <ChipButton
              key={value}
              active={rol === value}
              onClick={() => onRolChange(value)}
            >
              {label}
            </ChipButton>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <Switch
            checked={incluirInactivos}
            onCheckedChange={onIncluirInactivosChange}
            aria-label="Incluir inactivos"
          />
          <span className="text-sm text-muted-foreground">Incluir inactivos</span>
        </label>
      </div>
    </div>
  );
}

interface ChipButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ChipButton({ active, onClick, children }: ChipButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        'min-h-[44px] md:min-h-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-transparent text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}
