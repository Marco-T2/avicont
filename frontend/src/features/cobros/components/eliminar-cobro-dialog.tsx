import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';

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

import { useEliminarCobro } from '../hooks/use-cobro-mutations';

interface EliminarCobroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cobroId: string;
  glosa?: string;
}

/**
 * Eliminación física de un cobro en BORRADOR: irreversible → acción roja
 * (§14.3). Después del éxito navega al listado (el detalle ya no existe).
 */
export function EliminarCobroDialog({
  open,
  onOpenChange,
  cobroId,
  glosa,
}: EliminarCobroDialogProps): React.JSX.Element {
  const mutation = useEliminarCobro(cobroId);
  const navigate = useNavigate();

  function handleConfirm(): void {
    mutation.mutate(undefined, {
      onSuccess: () => {
        onOpenChange(false);
        void navigate('/cobros');
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
                Solo se pueden eliminar cobros en estado Borrador. Para dejar sin
                efecto un cobro contabilizado, usá la opción "Anular".
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
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
