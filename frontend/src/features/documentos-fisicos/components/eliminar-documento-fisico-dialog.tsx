import { Loader2 } from 'lucide-react';
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
import { mensajeDocumentosFisicos } from '@/lib/error-messages';
import type { DocumentoFisico } from '@/types/api';

import { useEliminarDocumentoFisico } from '../hooks/use-documento-fisico-mutations';

interface EliminarDocumentoFisicoDialogProps {
  documento: DocumentoFisico | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog de confirmación de eliminación de documento físico.
 * D4: backend es la autoridad — si responde 409, el dialog queda abierto
 * y se muestra un toast de error (Anti-F-13: e.preventDefault() en el action).
 */
export function EliminarDocumentoFisicoDialog({
  documento,
  open,
  onOpenChange,
}: EliminarDocumentoFisicoDialogProps): React.JSX.Element {
  const mutation = useEliminarDocumentoFisico();

  function handleConfirm(e: React.MouseEvent): void {
    // §14.3: e.preventDefault() evita que AlertDialog se cierre automáticamente.
    // El cierre se maneja manualmente en onSuccess.
    e.preventDefault();
    if (documento === null) return;

    mutation.mutate(documento.id, {
      onSuccess: () => {
        onOpenChange(false);
      },
      onError: (err) => {
        // Anti-F-13: toast SOLO en onError del call de mutate (no del hook).
        // El hook useEliminarDocumentoFisico NO tiene onError propio para este caso.
        toast.error(mensajeDocumentosFisicos(err));
        // El dialog permanece abierto (gracias al preventDefault).
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                ¿Eliminar documento{' '}
                <span className="font-medium font-mono">{documento?.numero}</span>?
                Esta acción es permanente y no puede deshacerse.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancelar
          </AlertDialogCancel>
          {/* §14.3 + §14.4: destructive porque la eliminación es irreversible */}
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eliminando…
              </>
            ) : (
              'Eliminar'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
