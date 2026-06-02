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
import type { FeatureFlag } from '@/types/api';

import { useDeleteFeatureFlag } from '../hooks/use-delete-feature-flag';

interface FeatureFlagDeleteDialogProps {
  flag: FeatureFlag | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirmación de eliminación de un feature flag global (super-admin, PR-4).
 * El DELETE es permanente (hard delete) → acción IRREVERSIBLE: botón en variant
 * destructive (§14.3). El AlertDialogAction usa preventDefault para controlar el
 * cierre desde el onSuccess de la mutation. Los toasts los emite
 * useDeleteFeatureFlag (Anti-F-13).
 */
export function FeatureFlagDeleteDialog({
  flag,
  open,
  onOpenChange,
}: FeatureFlagDeleteDialogProps): React.JSX.Element {
  const mutation = useDeleteFeatureFlag();

  function handleConfirm(e: React.MouseEvent): void {
    e.preventDefault();
    if (flag === null) return;
    mutation.mutate(flag.key, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar esta feature flag?</AlertDialogTitle>
          <AlertDialogDescription>
            La feature flag «{flag?.key ?? ''}» se eliminará de forma permanente. Esta acción
            no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
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
