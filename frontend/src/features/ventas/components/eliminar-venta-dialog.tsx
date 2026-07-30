import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Venta } from '@/types/api';

import { useEliminarVenta } from '../hooks/use-venta-mutations';
import { mensajeVentas } from '../lib/mensaje-ventas';

interface EliminarVentaDialogProps {
  venta: Venta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirmación de eliminación de un BORRADOR de venta.
 *
 * Es la excepción a "cero confirmaciones" (D-08): un DELETE físico es
 * irreversible — AlertDialog CON botón rojo (§14.3). El comprobante borrador
 * desaparece con la venta (REQ-VTA-01).
 */
export function EliminarVentaDialog({
  venta,
  open,
  onOpenChange,
}: EliminarVentaDialogProps): React.JSX.Element {
  const navigate = useNavigate();
  const mutation = useEliminarVenta();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar el borrador de venta?</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará definitivamente el borrador «{venta.glosa}» junto con
            su comprobante. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              // preventDefault: el cierre lo controla el onSuccess (§14.3).
              e.preventDefault();
              mutation.mutate(venta.id, {
                onSuccess: () => {
                  toast.success('Borrador eliminado');
                  onOpenChange(false);
                  void navigate('/ventas');
                },
                onError: (err) => {
                  toast.error(
                    mensajeVentas(err, 'No se pudo eliminar el borrador'),
                  );
                },
              });
            }}
          >
            {mutation.isPending ? 'Eliminando…' : 'Eliminar borrador'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
