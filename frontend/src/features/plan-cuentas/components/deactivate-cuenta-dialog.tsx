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
import {
  backendErrorMessage,
  conceptosBloqueantes,
  CONCEPTO_LABELS,
  extractBackendError,
} from '@/lib/error-messages';
import type { Cuenta } from '@/types/api';

import { useDeactivateCuenta } from '../hooks/use-cuenta-mutations';

interface DeactivateCuentaDialogProps {
  cuenta: Cuenta | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// AlertDialog de confirmación de desactivación. Maneja dos errores especiales
// del backend con CTAs apropiados:
//   - CUENTA_CONFIGURADA_COMO_CONCEPTO: muestra los conceptos que bloquean +
//     aviso para remapear en "Configuración contable".
//   - CUENTA_REQUERIDA_SISTEMA_INMUTABLE: el message del backend ya es claro.
export function DeactivateCuentaDialog({
  cuenta,
  open,
  onOpenChange,
}: DeactivateCuentaDialogProps): React.JSX.Element {
  const mutation = useDeactivateCuenta();

  function handleConfirm(): void {
    if (cuenta === null) return;
    mutation.mutate(cuenta.id, {
      onSuccess: () => {
        toast.success(`Cuenta ${cuenta.codigoInterno} desactivada`);
        onOpenChange(false);
      },
      onError: (err) => {
        const payload = extractBackendError(err);
        if (payload.code === 'CUENTA_CONFIGURADA_COMO_CONCEPTO') {
          const conceptos = conceptosBloqueantes(err)
            .map((c) => CONCEPTO_LABELS[c] ?? c)
            .join(', ');
          toast.error('No se puede desactivar — cuenta mapeada como concepto', {
            description: `Conceptos: ${conceptos}. Remapealos en Configuración contable antes de desactivar.`,
            action: {
              label: 'Configuración',
              onClick: () => toast.info('Pantalla "Configuración contable" — próximamente'),
            },
          });
          onOpenChange(false);
          return;
        }
        toast.error(backendErrorMessage(err, 'No se pudo desactivar la cuenta'));
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar esta cuenta?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                La cuenta{' '}
                <span className="font-mono text-xs">{cuenta?.codigoInterno}</span>{' '}
                — <span className="font-medium">{cuenta?.nombre}</span> no
                recibirá nuevos movimientos.
              </p>
              <p className="text-xs">
                Los movimientos históricos se preservan. Podrás reactivarla en
                cualquier momento.
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
