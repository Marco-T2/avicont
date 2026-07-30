import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { VentaForm, type VentaFormMode } from '../components/venta-form';
import { useVenta } from '../hooks/use-venta';

function PageSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/**
 * Página de alta/edición de venta.
 *
 * Rutas:
 *   /ventas/nueva        → sin :id, alta (permiso `contabilidad.ventas.create`)
 *   /ventas/:id/editar   → edición (permiso `contabilidad.ventas.read`; las
 *                          acciones se gatean por botón, §14.7)
 *
 * Una venta CONTABILIZADA sigue siendo editable mientras el período esté
 * abierto (§4.3, REQ-VTA-06) — el estado NO bloquea la edición. Sí la
 * bloquean el flag `anulado` (VENTA_ANULADA_NO_EDITABLE) y el estado
 * BLOQUEADO (período cerrado — el único camino es la reapertura formal, §4.4).
 */
export function VentaEditorPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNueva = id === undefined;

  const { data: venta, isLoading, isError } = useVenta(id ?? '');

  if (isNueva) {
    return <VentaForm mode="nueva" />;
  }

  if (isLoading) return <PageSkeleton />;

  if (isError || venta === undefined) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          Venta no encontrada o no tenés acceso.
        </p>
        <Button variant="outline" onClick={() => void navigate('/ventas')}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver a ventas
        </Button>
      </div>
    );
  }

  if (venta.anulado || venta.estado === 'BLOQUEADO') {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            {venta.anulado
              ? 'Esta venta está anulada y no admite cambios. Se preserva con su número para auditoría.'
              : 'El período contable de esta venta está cerrado. Para modificarla, un administrador debe reabrir el período.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => void navigate('/ventas')}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver a ventas
        </Button>
      </div>
    );
  }

  const mode: VentaFormMode =
    venta.estado === 'BORRADOR' ? 'borrador' : 'contabilizado';

  return <VentaForm mode={mode} venta={venta} />;
}
