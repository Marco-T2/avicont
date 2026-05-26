import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Gestion } from '@/types/api';

interface GestionSelectorProps {
  gestiones: Gestion[];
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
}

// Selector de gestión fiscal. Ordena por year DESC para que la más reciente
// aparezca primero. Renderiza nada si la lista está vacía — el empty state
// lo maneja el page.
export function GestionSelector({
  gestiones,
  value,
  onChange,
  className,
}: GestionSelectorProps): React.JSX.Element | null {
  if (gestiones.length === 0) return null;

  const sorted = [...gestiones].sort((a, b) => b.year - a.year);

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className={cn('w-[200px]', className)}>
        <SelectValue placeholder="Seleccionar gestión" />
      </SelectTrigger>
      <SelectContent>
        {sorted.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            <span className="flex items-center gap-2">
              Gestión {g.year}
              {g.status === 'CERRADA' ? (
                <Badge
                  variant="outline"
                  className="px-1 py-0 text-xs font-normal text-muted-foreground"
                >
                  Cerrada
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="px-1 py-0 text-xs font-normal"
                >
                  Abierta
                </Badge>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
