import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { EstadoAsociacion, TipoDocumentoFisico } from '@/types/api';

// Cross-feature: useTiposDocumentoFisico no se recibe como prop para no
// acoplar la page a este detalle — el componente recibe la lista resuelta.
// La page carga los tipos y los pasa como prop `tipos`.

interface EstadoOpcion {
  value: EstadoAsociacion | undefined;
  label: string;
}

const ESTADO_OPCIONES: EstadoOpcion[] = [
  { value: undefined, label: 'Todos' },
  { value: 'SUELTO', label: 'Sueltos' },
  { value: 'EN_BORRADOR', label: 'En borrador' },
  { value: 'CONTABILIZADO', label: 'Contabilizados' },
];

interface DocumentoFisicoListFiltersProps {
  numero: string;
  onNumeroChange: (value: string) => void;
  tipoId: string | undefined;
  onTipoChange: (value: string | undefined) => void;
  estadoAsociacion: EstadoAsociacion | undefined;
  onEstadoAsociacionChange: (value: EstadoAsociacion | undefined) => void;
  fechaDesde: string;
  onFechaDesdeChange: (value: string) => void;
  fechaHasta: string;
  onFechaHastaChange: (value: string) => void;
  tipos: TipoDocumentoFisico[];
}

export function DocumentoFisicoListFilters({
  numero,
  onNumeroChange,
  tipoId,
  onTipoChange,
  estadoAsociacion,
  onEstadoAsociacionChange,
  fechaDesde,
  onFechaDesdeChange,
  fechaHasta,
  onFechaHastaChange,
  tipos,
}: DocumentoFisicoListFiltersProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      {/* Fila de input + fechas */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <Label htmlFor="df-numero" className="mb-1 block text-sm">
            Número
          </Label>
          <Input
            id="df-numero"
            value={numero}
            onChange={(e) => onNumeroChange(e.target.value)}
            placeholder="Buscar por número…"
            className="text-base md:text-sm"
            aria-label="Buscar documento por número"
          />
        </div>

        <div className="flex-1">
          <Label htmlFor="df-tipo" className="mb-1 block text-sm">
            Tipo
          </Label>
          <select
            id="df-tipo"
            value={tipoId ?? ''}
            onChange={(e) => onTipoChange(e.target.value !== '' ? e.target.value : undefined)}
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1',
              'text-base shadow-xs outline-none md:text-sm',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            aria-label="Filtrar por tipo de documento"
          >
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="df-fecha-desde" className="mb-1 block text-sm">
            Desde
          </Label>
          <Input
            id="df-fecha-desde"
            type="date"
            value={fechaDesde}
            onChange={(e) => onFechaDesdeChange(e.target.value)}
            className="text-base md:text-sm"
            aria-label="Fecha desde"
          />
        </div>

        <div>
          <Label htmlFor="df-fecha-hasta" className="mb-1 block text-sm">
            Hasta
          </Label>
          <Input
            id="df-fecha-hasta"
            type="date"
            value={fechaHasta}
            onChange={(e) => onFechaHastaChange(e.target.value)}
            className="text-base md:text-sm"
            aria-label="Fecha hasta"
          />
        </div>
      </div>

      {/* Chips de estado */}
      <div className="flex flex-wrap gap-2">
        {ESTADO_OPCIONES.map(({ value, label }) => (
          <ChipButton
            key={label}
            active={estadoAsociacion === value}
            onClick={() => onEstadoAsociacionChange(value)}
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
