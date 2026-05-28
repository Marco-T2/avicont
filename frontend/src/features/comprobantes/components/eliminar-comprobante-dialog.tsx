import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

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
import { mensajeComprobantes } from '@/lib/error-messages';

import { useEliminarComprobante } from '../hooks/use-eliminar-comprobante';

interface EliminarComprobanteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comprobanteId: string;
  /** Glosa del comprobante — se muestra en el mensaje de confirmación. */
  glosa?: string;
}

/**
 * AlertDialog de confirmación de eliminación de un BORRADOR.
 * Solo los borradores pueden eliminarse (eliminación física del registro).
 * Después del éxito navega a /comprobantes (porque se llama desde el detail page).
 *
 * Pattern clonado de deactivate-cuenta-dialog.tsx (ver design obs 247 §"ConfirmDialog").
 */
export function EliminarComprobanteDialog({
  open,
  onOpenChange,
  comprobanteId,
  glosa,
}: EliminarComprobanteDialogProps): React.JSX.Element {
  const mutation = useEliminarComprobante(comprobanteId);
  const navigate = useNavigate();

  function handleConfirm(): void {
    mutation.mutate(undefined as unknown as void, {
      onSuccess: () => {
        toast.success('Borrador eliminado');
        onOpenChange(false);
        // Navegar a la lista porque el detalle ya no existe.
        void navigate('/comprobantes');
      },
      onError: (err) => {
        toast.error(mensajeComprobantes(err));
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este borrador?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {glosa !== undefined && glosa !== '' && (
                <p className="font-medium text-foreground">{glosa}</p>
              )}
              <p>
                Esta acción es <strong>irreversible</strong>. El borrador se
                eliminará permanentemente del sistema.
              </p>
              <p className="text-xs">
                Solo se pueden eliminar comprobantes en estado Borrador. Para
                anular un comprobante contabilizado, usá la opción "Anular".
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eliminando…
              </>
            ) : (
              'Eliminar borrador'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
