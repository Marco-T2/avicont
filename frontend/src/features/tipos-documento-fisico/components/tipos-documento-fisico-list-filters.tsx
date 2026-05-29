import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { EstadoFiltro } from '../lib/build-tipos-documento-fisico-params';

const ESTADOS: { value: EstadoFiltro; label: string }[] = [
  { value: 'activos', label: 'Activos' },
  { value: 'inactivos', label: 'Inactivos' },
  { value: 'todos', label: 'Todos' },
];

interface TiposDocumentoFisicoListFiltersProps {
  q: string;
  onSearchChange: (value: string) => void;
  estado: EstadoFiltro;
  onEstadoChange: (estado: EstadoFiltro) => void;
}

export function TiposDocumentoFisicoListFilters({
  q,
  onSearchChange,
  estado,
  onEstadoChange,
}: TiposDocumentoFisicoListFiltersProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre o código…"
          aria-label="Buscar tipo de documento"
          role="searchbox"
          className="pl-9 pr-9 text-base md:text-sm"
        />
        {q.length > 0 ? (
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

      <div className="flex flex-wrap gap-2">
        {ESTADOS.map(({ value, label }) => (
          <ChipButton
            key={value}
            active={estado === value}
            onClick={() => onEstadoChange(value)}
          >
            {label}
          </ChipButton>
        ))}
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
