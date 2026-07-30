import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { EstadoFiltro, TipoFiltro } from '../lib/build-items-params';

const TIPOS: { value: TipoFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'PRODUCTO', label: 'Productos' },
  { value: 'SERVICIO', label: 'Servicios' },
];

const ESTADOS: { value: EstadoFiltro; label: string }[] = [
  { value: 'activos', label: 'Activos' },
  { value: 'inactivos', label: 'Inactivos' },
  { value: 'todos', label: 'Todos' },
];

interface ItemListFiltersProps {
  q: string;
  onSearchChange: (value: string) => void;
  tipo: TipoFiltro;
  onTipoChange: (tipo: TipoFiltro) => void;
  estado: EstadoFiltro;
  onEstadoChange: (estado: EstadoFiltro) => void;
}

export function ItemListFilters({
  q,
  onSearchChange,
  tipo,
  onTipoChange,
  estado,
  onEstadoChange,
}: ItemListFiltersProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre o código…"
          aria-label="Buscar ítem"
          role="searchbox"
          className="pl-9 pr-9 pointer-coarse:pr-12 text-base md:text-sm"
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar por tipo"
        >
          {TIPOS.map(({ value, label }) => (
            <ChipButton
              key={value}
              active={tipo === value}
              onClick={() => onTipoChange(value)}
            >
              {label}
            </ChipButton>
          ))}
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar por estado"
        >
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
        // Piso táctil de 44px por dispositivo (pointer: coarse) — la chip es un
        // <button> crudo, el piso del primitivo no la cubre.
        'pointer-coarse:min-h-11',
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
