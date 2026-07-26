import { useState } from 'react';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import type { ArranqueAplicado } from '@/types/api';

import { useAnularArranque } from '../hooks/use-anular-arranque';

const MOTIVO_MINIMO = 10;

interface AnularArranqueDialogProps {
  /** `null` ⇒ cerrado. La declaración que se está por anular. */
  arranque: ArranqueAplicado | null;
  cuentaBancariaId: string;
  onClose: () => void;
}

/**
 * Confirmación de anulado de una declaración de arranque (REQ-ICB-04, §4.7).
 *
 * El motivo es obligatorio y con mínimo significativo, igual que en la
 * anulación de comprobantes: la declaración anulada queda para siempre en el
 * historial, y sin el porqué el rastro no le explica nada al próximo contador.
 *
 * No se ofrece "deshacer la anulación": anular se registra UNA vez con su
 * autor. Si hace falta volver al mismo punto de partida, se declara de nuevo —
 * y esa declaración nueva también queda atribuida.
 *
 * El padre lo remonta con `key` por declaración, así que el motivo arranca en
 * blanco en cada apertura sin sincronizar estado en un efecto: un motivo
 * tipeado para OTRA declaración y dejado ahí sería exactamente el rastro
 * equivocado.
 */
export function AnularArranqueDialog({
  arranque,
  cuentaBancariaId,
  onClose,
}: AnularArranqueDialogProps): React.JSX.Element {
  const [motivo, setMotivo] = useState('');
  const anular = useAnularArranque();

  const motivoValido = motivo.trim().length >= MOTIVO_MINIMO;

  function confirmar(): void {
    if (arranque === null || !motivoValido) return;
    anular.mutate(
      { id: arranque.id, cuentaBancariaId, motivo: motivo.trim() },
      { onSuccess: onClose },
    );
  }

  return (
    <AlertDialog open={arranque !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anular la declaración de arranque</AlertDialogTitle>
          <AlertDialogDescription>
            {arranque !== null ? (
              <>
                Se anula el punto de partida del{' '}
                <strong>{formatearFechaContable(arranque.fecha)}</strong>. Deja de aplicar, pero
                no se borra: sigue en el historial con este motivo y con tu nombre. El informe
                pasa a apoyarse en la declaración anterior, o queda sin punto de partida si no
                hay ninguna.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="motivo-anulacion">Motivo</Label>
          <Textarea
            id="motivo-anulacion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por ejemplo: se cargó con la fecha del cierre siguiente por error"
            className="min-h-[80px] w-full max-w-full resize-y [field-sizing:fixed] text-base md:text-sm"
            aria-invalid={motivo.length > 0 && !motivoValido}
          />
          <p className="text-xs text-muted-foreground">
            Explicá qué pasó: esta línea queda en el historial para siempre y es lo único que
            va a decirle al próximo por qué este punto de partida no valía.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={anular.isPending}>Cancelar</AlertDialogCancel>
          {/* Anti-F-07: la acción destructiva no se puede disparar dos veces. */}
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={!motivoValido || anular.isPending}
          >
            {anular.isPending ? 'Anulando…' : 'Anular declaración'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
