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
import type { CuentaBancaria } from '@/types/api';

import { useEliminarCuentaBancaria } from '../hooks/use-cuenta-bancaria-mutations';

interface EliminarCuentaBancariaDialogProps {
  cuentaBancaria: CuentaBancaria | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Eliminación física (DELETE hard) — irreversible, por eso AlertDialogAction
// destructivo (§14.3 frontend/CLAUDE.md). El backend rechaza con 409 si tiene
// movimientos/importaciones asociados; el toast del hook muestra ese mensaje.
export function EliminarCuentaBancariaDialog({
  cuentaBancaria,
  open,
  onOpenChange,
}: EliminarCuentaBancariaDialogProps): React.JSX.Element {
  const mutation = useEliminarCuentaBancaria();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar cuenta bancaria</AlertDialogTitle>
          <AlertDialogDescription>
            {cuentaBancaria !== null
              ? `Se eliminará "${cuentaBancaria.alias}" permanentemente. Esta acción no se puede deshacer.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (cuentaBancaria === null) return;
              mutation.mutate(cuentaBancaria.id, {
                onSuccess: () => onOpenChange(false),
              });
            }}
          >
            {mutation.isPending ? 'Eliminando…' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
