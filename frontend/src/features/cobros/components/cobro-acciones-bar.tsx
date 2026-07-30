import { Ban, BookCheck, Loader2, Trash2 } from 'lucide-react';

import { PermissionButton } from '@/components/shared/permission-button';
import { PERMISSIONS } from '@/lib/permissions';
import type { Cobro } from '@/types/api';

import { useContabilizarCobro } from '../hooks/use-cobro-mutations';

interface CobroAccionesBarProps {
  cobro: Cobro;
  onAnular: () => void;
  onEliminar: () => void;
}

/**
 * Acciones del ciclo de vida del cobro (§14.7, gating con PERMISSIONS.*):
 * - BORRADOR: Contabilizar (cobros.post, SIN confirmación — D-14) y Eliminar
 *   borrador (cobros.delete, AlertDialog rojo).
 * - CONTABILIZADO/BLOQUEADO no anulado: Anular (cobros.void, AlertDialog rojo
 *   con motivo — la única fricción del flujo).
 * - Anulado: sin acciones (terminal, §4.7).
 */
export function CobroAccionesBar({
  cobro,
  onAnular,
  onEliminar,
}: CobroAccionesBarProps): React.JSX.Element | null {
  const contabilizarMutation = useContabilizarCobro(cobro.id);

  if (cobro.anulado) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {cobro.estado === 'BORRADOR' && (
        <>
          <PermissionButton
            permission={PERMISSIONS.contabilidad.cobros.post}
            deniedReason="No tenés permiso para contabilizar cobros"
            disabled={contabilizarMutation.isPending}
            onClick={() => contabilizarMutation.mutate()}
          >
            {contabilizarMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Contabilizando…
              </>
            ) : (
              <>
                <BookCheck className="h-4 w-4 mr-2" />
                Contabilizar
              </>
            )}
          </PermissionButton>
          <PermissionButton
            permission={PERMISSIONS.contabilidad.cobros.delete}
            deniedReason="No tenés permiso para eliminar borradores de cobro"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={onEliminar}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar borrador
          </PermissionButton>
        </>
      )}

      {(cobro.estado === 'CONTABILIZADO' || cobro.estado === 'BLOQUEADO') && (
        <PermissionButton
          permission={PERMISSIONS.contabilidad.cobros.void}
          deniedReason="No tenés permiso para anular cobros"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={onAnular}
        >
          <Ban className="h-4 w-4 mr-2" />
          Anular
        </PermissionButton>
      )}
    </div>
  );
}
