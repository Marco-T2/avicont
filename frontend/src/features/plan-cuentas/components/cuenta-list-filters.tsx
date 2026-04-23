import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ClaseCuenta } from '@/types/api';

const CLASES: ClaseCuenta[] = [
  ClaseCuenta.ACTIVO,
  ClaseCuenta.PASIVO,
  ClaseCuenta.PATRIMONIO,
  ClaseCuenta.INGRESO,
  ClaseCuenta.EGRESO,
];

const LABELS_CLASE: Record<ClaseCuenta, string> = {
  ACTIVO: 'Activo',
  PASIVO: 'Pasivo',
  PATRIMONIO: 'Patrimonio',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
};

interface CuentaListFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  clase: ClaseCuenta | null;
  onClaseChange: (value: ClaseCuenta | null) => void;
}

export function CuentaListFilters({
  search,
  onSearchChange,
  clase,
  onClaseChange,
}: CuentaListFiltersProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre o código interno…"
          aria-label="Buscar cuenta"
          className="pl-9 pr-9"
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

      <div className="flex flex-wrap gap-2">
        <ChipButton
          active={clase === null}
          onClick={() => onClaseChange(null)}
        >
          Todas
        </ChipButton>
        {CLASES.map((c) => (
          <ChipButton
            key={c}
            active={clase === c}
            onClick={() => onClaseChange(clase === c ? null : c)}
          >
            {LABELS_CLASE[c]}
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
