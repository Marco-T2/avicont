import { HistoryIcon, Pencil, Trash2, X } from 'lucide-react';

import { PermissionButton } from '@/components/shared/permission-button';
import { Button } from '@/components/ui/button';
import { PERMISSIONS } from '@/lib/permissions';
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
 * - BORRADOR (no anulado): Editar, Contabilizar, Eliminar, Ver auditoría
 * - CONTABILIZADO (no anulado): Editar, Anular, Ver auditoría
 * - CONTABILIZADO (anulado): Ver auditoría (read-only)
 * - BLOQUEADO: solo Ver auditoría
 *
 * Gating UX: cada acción de escritura usa <PermissionButton>. Si el usuario no
 * tiene el permiso, el botón se muestra deshabilitado con un tooltip que explica
 * por qué (afordancia honesta). La autoridad real sigue siendo el backend, que
 * rechaza con 403 igual (CLAUDE.md §5 defense in depth). "Ver auditoría" no se
 * gatea acá (es lectura, fuera del alcance de este slice).
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
        <PermissionButton
          permission={PERMISSIONS.contabilidad.asientos.update}
          deniedReason="No tenés permiso para editar asientos"
          variant="outline"
          size="sm"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Editar
        </PermissionButton>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.asientos.post}
          deniedReason="No tenés permiso para contabilizar asientos"
          size="sm"
          onClick={onContabilizar}
        >
          Contabilizar
        </PermissionButton>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.asientos.delete}
          deniedReason="No tenés permiso para eliminar asientos"
          variant="outline"
          size="sm"
          onClick={onEliminar}
          className="text-destructive border-destructive/40 hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Eliminar
        </PermissionButton>
        <Button variant="ghost" size="sm" onClick={onVerAuditoria}>
          <HistoryIcon className="h-3.5 w-3.5 mr-1.5" />
          Ver auditoría
        </Button>
      </div>
    );
  }

  if (estado === 'CONTABILIZADO' && !anulado) {
    return (
      <div className="flex flex-wrap gap-2">
        <PermissionButton
          permission={PERMISSIONS.contabilidad.asientos.update}
          deniedReason="No tenés permiso para editar asientos"
          variant="outline"
          size="sm"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Editar
        </PermissionButton>
        <PermissionButton
          permission={PERMISSIONS.contabilidad.asientos.void}
          deniedReason="No tenés permiso para anular asientos"
          variant="outline"
          size="sm"
          onClick={onAnular}
          className="text-destructive border-destructive/40 hover:bg-destructive/10"
        >
          <X className="h-3.5 w-3.5 mr-1.5" />
          Anular
        </PermissionButton>
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
