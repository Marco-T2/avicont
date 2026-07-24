import { AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EstadoEfectivoMovimiento, MovimientoConciliacion } from '@/types/api';

import {
  etiquetaEstadoEfectivoMovimiento,
  etiquetaMotivoVinculoRoto,
} from '../lib/etiquetas-conciliacion';

// Colores de estado con par claro/oscuro explícito (mismo criterio que
// `estado-comprobante-badge.tsx`): la variable semántica del tema no alcanza
// para distinguir tres estados, y el par `dark:` garantiza legibilidad en
// ambos temas (Anti-F-10 se respeta en su intención: nada rompe en dark).
const CLASES_ESTADO: Record<EstadoEfectivoMovimiento, string> = {
  PENDIENTE:
    'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
  CONCILIADO:
    'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900',
  IGNORADO: 'text-muted-foreground bg-muted border-border',
};

interface EstadoMovimientoBadgeProps {
  movimiento: MovimientoConciliacion;
  className?: string;
}

/**
 * Badge del estado de un movimiento bancario.
 *
 * **Recibe el movimiento entero a propósito**: lee `estadoEfectivo` (derivado
 * en cada lectura, REQ-CB-10/11) y NUNCA la columna persistida `estado`.
 * Pintar la columna le mostraría al contador un cuadre que no existe cuando el
 * ancla del match dejó de calzar.
 *
 * Cuando el vínculo está roto se agrega una marca visible con el motivo exacto
 * — el motivo no se traga: es lo que le dice al usuario si tiene que
 * re-confirmar o corregir el asiento.
 */
export function EstadoMovimientoBadge({
  movimiento,
  className,
}: EstadoMovimientoBadgeProps): React.JSX.Element {
  const roto = movimiento.vinculo?.roto ?? null;

  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <Badge
        role="status"
        variant="outline"
        className={cn('font-normal', CLASES_ESTADO[movimiento.estadoEfectivo])}
      >
        {etiquetaEstadoEfectivoMovimiento(movimiento.estadoEfectivo)}
      </Badge>

      {roto !== null && (
        <>
          <Badge
            variant="outline"
            className="font-normal text-destructive border-destructive/40 bg-destructive/10"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Vínculo roto
          </Badge>
          <span className="text-xs text-muted-foreground">{etiquetaMotivoVinculoRoto(roto)}</span>
        </>
      )}
    </div>
  );
}
