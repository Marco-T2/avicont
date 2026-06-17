import { Loader2 } from 'lucide-react';

import { PermissionButton } from '@/components/shared/permission-button';
import { PERMISSIONS } from '@/lib/permissions';
import type { EstadoComprobante } from '@/types/api';

import type { ProgresoPaso } from '../hooks/use-contabilizar-cierre';

interface ContabilizarCierreBarProps {
  cierres: { id: string; estado: EstadoComprobante }[];
  progreso: ProgresoPaso[];
  isPending: boolean;
  onContabilizar: () => void;
}

/**
 * Barra de acción para contabilizar los comprobantes de cierre secuencialmente.
 * Un botón único gateado por permiso + render del progreso por comprobante.
 * Anti-F-07: disabled cuando isPending (no doble-post).
 */
export function ContabilizarCierreBar({
  cierres,
  progreso,
  isPending,
  onContabilizar,
}: ContabilizarCierreBarProps): React.JSX.Element {
  const progresoPorId = new Map(progreso.map((p) => [p.comprobanteId, p]));

  return (
    <div className="space-y-3">
      {/* Botón principal */}
      <PermissionButton
        permission={PERMISSIONS.contabilidad.asientos.post}
        deniedReason="No tenés permiso para contabilizar asientos"
        onClick={onContabilizar}
        disabled={isPending}
      >
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Contabilizar cierre
      </PermissionButton>

      {/* Progreso por comprobante — visible solo si hay progreso */}
      {progreso.length > 0 && (
        <ul className="space-y-1">
          {cierres.map((cierre, idx) => {
            const paso = progresoPorId.get(cierre.id);
            const etiqueta = `Asiento ${idx + 1}`;

            if (paso === undefined || paso.estado === 'pendiente') {
              return (
                <li key={cierre.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-4 w-4 text-center">·</span>
                  <span>{etiqueta}</span>
                </li>
              );
            }

            if (paso.estado === 'contabilizando') {
              return (
                <li key={cierre.id} className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Contabilizando {etiqueta}…</span>
                </li>
              );
            }

            if (paso.estado === 'contabilizado') {
              return (
                <li key={cierre.id} className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <span className="h-4 w-4 text-center font-bold">✓</span>
                  <span>{etiqueta} contabilizado</span>
                </li>
              );
            }

            // estado === 'error'
            return (
              <li key={cierre.id} className="space-y-0.5 text-sm text-destructive">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 text-center font-bold">✗</span>
                  <span>{etiqueta} — error</span>
                </div>
                {paso.error !== undefined && (
                  <p className="ml-6 text-xs">{paso.error}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
