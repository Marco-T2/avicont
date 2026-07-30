import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

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

import { useAnularCobro } from '../hooks/use-cobro-mutations';
import { anularCobroSchema, type AnularCobroValues } from '../schemas/anular-cobro-schema';

interface AnularCobroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cobroId: string;
  /** Cantidad de aplicaciones vivas — para dimensionar la advertencia. */
  cantidadAplicaciones: number;
}

/**
 * Anulación del cobro (§4.7): irreversible, exige motivo ≥ 10 caracteres
 * significativos — la ÚNICA fricción del flujo (D-14). AlertDialog con acción
 * roja por irreversible (§14.3).
 *
 * REQ-CXC-06: la advertencia dice EXPLÍCITAMENTE que anular elimina las
 * aplicaciones del cobro y que las ventas vuelven a quedar pendientes.
 */
export function AnularCobroDialog({
  open,
  onOpenChange,
  cobroId,
  cantidadAplicaciones,
}: AnularCobroDialogProps): React.JSX.Element {
  const mutation = useAnularCobro(cobroId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AnularCobroValues>({
    resolver: zodResolver(anularCobroSchema),
    defaultValues: { motivo: '' },
  });

  useEffect(() => {
    if (open) reset({ motivo: '' });
  }, [open, reset]);

  function onSubmit(values: AnularCobroValues): void {
    mutation.mutate(values.motivo, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Anular este cobro?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Esta acción es <strong>irreversible</strong>. El comprobante del
                cobro se preserva anulado y su número no se reutiliza.
              </p>
              <p className="font-medium text-foreground">
                {cantidadAplicaciones > 0
                  ? `Anular elimina ${cantidadAplicaciones === 1 ? 'la aplicación viva' : `las ${cantidadAplicaciones} aplicaciones vivas`} de este cobro: las ventas vuelven a quedar pendientes por el monto que tenían aplicado.`
                  : 'Anular elimina las aplicaciones del cobro (este no tiene ninguna) y las ventas aplicadas vuelven a quedar pendientes.'}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="anular-cobro-motivo">Motivo de anulación</Label>
          <Textarea
            id="anular-cobro-motivo"
            placeholder="Describí el motivo con al menos 10 caracteres significativos"
            // Anti-F-14: [field-sizing:fixed] obligatorio dentro de un Dialog.
            className="text-base md:text-sm min-h-[80px] w-full max-w-full resize-y [field-sizing:fixed]"
            aria-invalid={errors.motivo !== undefined}
            {...register('motivo')}
          />
          {errors.motivo !== undefined && (
            <p className="text-sm text-destructive" role="alert">
              {errors.motivo.message}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // §14.3: preventDefault para cerrar solo desde onSuccess.
              e.preventDefault();
              void handleSubmit(onSubmit)();
            }}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Anulando…
              </>
            ) : (
              'Confirmar anulación'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
