import { Loader2 } from 'lucide-react';

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
import type { Item } from '@/types/api';

import { useDesactivarItem } from '../hooks/use-item-mutations';

interface DesactivarItemDialogProps {
  item: Item | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Desactivar es REVERSIBLE (existe /reactivar): el action queda con el estilo
// default del AlertDialog, sin rojo (§14.3). Los toasts los emite el hook.
export function DesactivarItemDialog({
  item,
  open,
  onOpenChange,
}: DesactivarItemDialogProps): React.JSX.Element {
  const mutation = useDesactivarItem();

  function handleConfirm(): void {
    if (item === null) return;
    mutation.mutate(item.id, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar este ítem?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                El ítem <span className="font-medium">{item?.nombre}</span> dejará
                de ofrecerse en ventas nuevas.
              </p>
              <p className="text-xs">
                Las ventas existentes conservan sus datos. Podrás reactivarlo en
                cualquier momento.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // preventDefault: el cierre lo controla el onSuccess de la
              // mutation, no el click (§14.3).
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
