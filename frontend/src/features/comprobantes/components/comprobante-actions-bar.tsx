import { HistoryIcon, Pencil, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Comprobante } from '@/types/api';

interface ComprobanteActionsBarProps {
  comprobante: Comprobante;
  /** Abre el sheet de edición (mode determinado por el padre según estado). */
  onEdit: () => void;
  /** Abre el diálogo de contabilización. */
  onContabilizar: () => void;
  /** Abre el sheet de anulación. */
  onAnular: () => void;
  /** Abre el diálogo de eliminación (solo BORRADOR). */
  onEliminar: () => void;
  /** Abre el sheet de auditoría. */
  onVerAuditoria: () => void;
}

/**
 * Barra de acciones del detalle de un comprobante.
 * Muestra botones condicionales según el estado y el flag anulado.
 *
 * Lógica (REQ-COMP-UI-DETAIL-04 y -05 del spec):
 * - BORRADOR (no anulado): Editar, Contabilizar, Eliminar
 * - CONTABILIZADO (no anulado): Editar, Anular, Ver auditoría
 * - CONTABILIZADO (anulado): Ver auditoría (read-only)
 * - BLOQUEADO: solo Ver auditoría
 *
 * Nota: "Editar" en CONTABILIZADO se muestra siempre. Si el usuario no tiene
 * permiso, el backend rechaza con 403 y mensajeComprobantes() traduce el error
 * a toast legible. (design obs 247 §"Permission gating")
 */
export function ComprobanteActionsBar({
  comprobante,
  onEdit,
  onContabilizar,
  onAnular,
  onEliminar,
  onVerAuditoria,
}: ComprobanteActionsBarProps): React.JSX.Element {
  const { estado, anulado } = comprobante;

  if (estado === 'BORRADOR' && !anulado) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Editar
        </Button>
        <Button size="sm" onClick={onContabilizar}>
          Contabilizar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onEliminar}
          className="text-destructive border-destructive/40 hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Eliminar
        </Button>
      </div>
    );
  }

  if (estado === 'CONTABILIZADO' && !anulado) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Editar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onAnular}
          className="text-destructive border-destructive/40 hover:bg-destructive/10"
        >
          <X className="h-3.5 w-3.5 mr-1.5" />
          Anular
        </Button>
        <Button variant="ghost" size="sm" onClick={onVerAuditoria}>
          <HistoryIcon className="h-3.5 w-3.5 mr-1.5" />
          Ver auditoría
        </Button>
      </div>
    );
  }

  // CONTABILIZADO anulado o BLOQUEADO — solo auditoría
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" onClick={onVerAuditoria}>
        <HistoryIcon className="h-3.5 w-3.5 mr-1.5" />
        Ver auditoría
      </Button>
    </div>
  );
}
