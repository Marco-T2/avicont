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
import type { Contacto } from '@/types/api';

import { useDesactivarContacto } from '../hooks/use-contacto-mutations';

interface DesactivarContactoDialogProps {
  contacto: Contacto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DesactivarContactoDialog({
  contacto,
  open,
  onOpenChange,
}: DesactivarContactoDialogProps): React.JSX.Element {
  const mutation = useDesactivarContacto();

  function handleConfirm(): void {
    if (contacto === null) return;
    mutation.mutate(contacto.id, {
      onSuccess: () => {
        toast.success(`Contacto "${contacto.razonSocial}" desactivado`);
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(backendErrorMessage(err, 'No se pudo desactivar el contacto'));
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar este contacto?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                El contacto{' '}
                <span className="font-medium">{contacto?.razonSocial}</span> no
                podrá usarse en comprobantes nuevos.
              </p>
              <p className="text-xs">
                Los comprobantes históricos siguen referenciando este contacto.
                Podrás reactivarlo en cualquier momento.
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
