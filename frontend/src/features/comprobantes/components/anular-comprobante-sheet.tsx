import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { mensajeComprobantes } from '@/lib/error-messages';

import { useAnularComprobante } from '../hooks/use-anular-comprobante';
import {
  anularComprobanteSchema,
  type AnularComprobanteValues,
} from '../schemas/anular-comprobante-schema';

interface AnularComprobanteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comprobanteId: string;
  /** Glosa del comprobante — se muestra en el header del sheet. */
  glosa?: string;
}

/**
 * Sheet de anulación de comprobante contabilizado.
 * Exige un motivo con al menos 10 caracteres significativos (sin espacios
 * en blanco — se hace trim() antes de validar con zod).
 *
 * Bug pattern: la textarea usa `[field-sizing:fixed] resize-y` OBLIGATORIO.
 * Sin esto, el componente shadcn Textarea con `field-sizing-content` expande
 * el ancho horizontal del contenedor en Sheet y rompe el layout.
 * Ver precedente: reabrir-periodo-dialog.tsx línea 98.
 */
export function AnularComprobanteSheet({
  open,
  onOpenChange,
  comprobanteId,
  glosa,
}: AnularComprobanteSheetProps): React.JSX.Element {
  const mutation = useAnularComprobante(comprobanteId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AnularComprobanteValues>({
    resolver: zodResolver(anularComprobanteSchema),
    defaultValues: { motivo: '' },
  });

  // Resetear el form al abrir/cerrar
  useEffect(() => {
    if (open) reset({ motivo: '' });
  }, [open, reset]);

  function onSubmit(values: AnularComprobanteValues): void {
    mutation.mutate(values.motivo, {
      onSuccess: () => {
        toast.success('Comprobante anulado correctamente');
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(mensajeComprobantes(err));
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>Anular comprobante</SheetTitle>
          <SheetDescription>
            {glosa !== undefined && glosa !== ''
              ? `"${glosa}"`
              : 'Esta operación no puede deshacerse.'}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="px-4 py-4 space-y-4 flex flex-col flex-1"
        >
          <div className="space-y-1.5">
            <Label htmlFor="anular-motivo">Motivo de anulación</Label>
            <Textarea
              id="anular-motivo"
              placeholder="Describí el motivo con al menos 10 caracteres significativos (no se aceptan solo espacios)"
              // `[field-sizing:fixed]` es OBLIGATORIO — sin esto la textarea
              // shadcn (field-sizing-content por default) empuja el sheet
              // horizontalmente con líneas largas sin espacios.
              // `resize-y` permite al usuario agrandar verticalmente.
              // Precedente: reabrir-periodo-dialog.tsx línea 98.
              className="text-base md:text-sm min-h-[100px] w-full max-w-full resize-y [field-sizing:fixed]"
              aria-invalid={errors.motivo !== undefined}
              {...register('motivo')}
            />
            {errors.motivo !== undefined && (
              <p className="text-sm text-destructive" role="alert">
                {errors.motivo.message}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
            La anulación es irreversible. El comprobante se preserva en el
            sistema con marca de anulado y no se reutilizará su número.
          </p>

          <SheetFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Anulando…
                </>
              ) : (
                'Confirmar anulación'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
