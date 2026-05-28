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
import { mensajeComprobantes } from '@/lib/error-messages';
import type { Comprobante } from '@/types/api';

import { useContabilizarComprobante } from '../hooks/use-contabilizar-comprobante';

interface ContabilizarComprobanteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comprobanteId: string;
  /** Glosa del comprobante — se muestra en el diálogo de confirmación. */
  glosa?: string;
}

/**
 * AlertDialog de confirmación de contabilización.
 * Al confirmar, usa useContabilizarComprobante y muestra el número
 * correlativo asignado en el toast de éxito.
 */
export function ContabilizarComprobanteDialog({
  open,
  onOpenChange,
  comprobanteId,
  glosa,
}: ContabilizarComprobanteDialogProps): React.JSX.Element {
  const mutation = useContabilizarComprobante(comprobanteId);

  function handleConfirm(): void {
    mutation.mutate(undefined as unknown as void, {
      onSuccess: (comprobante: Comprobante) => {
        const numero = comprobante.numero;
        toast.success(
          numero !== null && numero !== undefined && numero !== ''
            ? `Comprobante contabilizado: ${numero}`
            : 'Comprobante contabilizado correctamente',
        );
        onOpenChange(false);
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
          <AlertDialogTitle>¿Contabilizar este comprobante?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {glosa !== undefined && glosa !== '' && (
                <p className="font-medium text-foreground">{glosa}</p>
              )}
              <p>
                Al contabilizar se asignará un número correlativo inmutable. El
                comprobante quedará registrado en el libro diario.
              </p>
              <p className="text-xs">
                Podés editar el comprobante contabilizado mientras el período
                esté abierto, pero el número no cambiará.
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
                Contabilizando…
              </>
            ) : (
              'Contabilizar'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
