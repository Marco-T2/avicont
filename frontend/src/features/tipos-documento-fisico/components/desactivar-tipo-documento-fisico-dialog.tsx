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
import { backendErrorMessage } from '@/lib/error-messages';
import type { TipoDocumentoFisico } from '@/types/api';

import { useSetActivoTipoDocumentoFisico } from '../hooks/use-tipo-documento-fisico-mutations';

interface DesactivarTipoDocumentoFisicoDialogProps {
  tipo: TipoDocumentoFisico | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // onConfirm se llama DESPUÉS del éxito de la mutation (permite al parent limpiar estado).
  onConfirm: () => void;
}

export function DesactivarTipoDocumentoFisicoDialog({
  tipo,
  open,
  onOpenChange,
  onConfirm,
}: DesactivarTipoDocumentoFisicoDialogProps): React.JSX.Element {
  const mutation = useSetActivoTipoDocumentoFisico();

  function handleConfirm(e: React.MouseEvent): void {
    // e.preventDefault() evita que AlertDialog se cierre automáticamente;
    // el cierre se maneja en onSuccess (patrón §14.3).
    e.preventDefault();
    if (tipo === null) return;
    mutation.mutate(
      { id: tipo.id, activo: false },
      {
        onSuccess: () => {
          toast.success(`Tipo de documento desactivado`);
          onConfirm();
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(
            backendErrorMessage(err, 'No se pudo desactivar el tipo de documento'),
          );
        },
      },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar este tipo de documento?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                El tipo{' '}
                <span className="font-medium">{tipo?.nombre}</span> no podrá
                usarse en documentos nuevos; los históricos lo siguen
                referenciando.
              </p>
              <p className="text-xs">
                Podés reactivarlo en cualquier momento.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Desactivando…
              </>
            ) : (
              'Desactivar'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
