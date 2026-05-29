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
  /**
   * Números de línea (1-based) que requieren contacto pero no lo tienen.
   * Si hay al menos uno, se muestra un aviso y se bloquea la contabilización
   * hasta que el usuario complete los campos. Validación BLANDA — no bloquea
   * guardar borrador (design §Decisión 2).
   */
  lineasSinContacto?: number[];
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
  lineasSinContacto = [],
}: ContabilizarComprobanteDialogProps): React.JSX.Element {
  const mutation = useContabilizarComprobante(comprobanteId);

  // Guard pre-submit: si hay líneas con contacto faltante, bloquear la mutación.
  // design §Decisión 2 — validación blanda, no bloquea borrador.
  const hayLineasSinContacto = lineasSinContacto.length > 0;

  function handleConfirm(): void {
    if (hayLineasSinContacto) return;
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

              {/* Aviso blando de contacto faltante — REQ-CCL-UI-02. */}
              {/* design §Decisión 2: no bloquea guardar borrador, pero sí la contabilización. */}
              {hayLineasSinContacto && (
                <div
                  role="alert"
                  className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-amber-700 dark:text-amber-400 text-xs space-y-1"
                >
                  <p className="font-medium">
                    Las siguientes líneas requieren un contacto antes de contabilizar:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {lineasSinContacto.map((n) => (
                      <li key={n}>Línea {n}: asigná un contacto antes de continuar.</li>
                    ))}
                  </ul>
                </div>
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
            disabled={mutation.isPending || hayLineasSinContacto}
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
