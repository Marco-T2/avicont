import { X } from 'lucide-react';

import { ContactoCombobox } from '@/components/shared/contacto-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface VentasFiltersProps {
  contactoId: string | null;
  onContactoChange: (id: string | null) => void;
  fechaDesde: string;
  onFechaDesdeChange: (v: string) => void;
  fechaHasta: string;
  onFechaHastaChange: (v: string) => void;
  hayFiltros: boolean;
  onLimpiar: () => void;
}

/** Filtros del listado: cliente + rango de fecha contable (query de GET /api/ventas). */
export function VentasFilters({
  contactoId,
  onContactoChange,
  fechaDesde,
  onFechaDesdeChange,
  fechaHasta,
  onFechaHastaChange,
  hayFiltros,
  onLimpiar,
}: VentasFiltersProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="space-y-1.5 sm:w-72">
        <Label>Cliente</Label>
        <ContactoCombobox
          value={contactoId}
          onSelect={onContactoChange}
          placeholder="Todos los clientes"
          aria-label="Filtrar por cliente"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ventas-fecha-desde">Desde</Label>
        <Input
          id="ventas-fecha-desde"
          type="date"
          value={fechaDesde}
          onChange={(e) => onFechaDesdeChange(e.target.value)}
          className="text-base md:text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ventas-fecha-hasta">Hasta</Label>
        <Input
          id="ventas-fecha-hasta"
          type="date"
          value={fechaHasta}
          onChange={(e) => onFechaHastaChange(e.target.value)}
          className="text-base md:text-sm"
        />
      </div>
      {hayFiltros && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onLimpiar}
          className="self-start sm:self-end"
        >
          <X className="h-4 w-4 mr-1" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
