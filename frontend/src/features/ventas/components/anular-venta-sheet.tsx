import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
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

import { useAnularVenta } from '../hooks/use-venta-mutations';
import { mensajeVentas } from '../lib/mensaje-ventas';
import {
  anularVentaSchema,
  type AnularVentaValues,
} from '../schemas/anular-venta-schema';

interface AnularVentaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ventaId: string;
  /** Glosa de la venta — se muestra en el header del sheet. */
  glosa?: string;
}

/**
 * Sheet de anulación de venta contabilizada — la ÚNICA fricción del flujo
 * (REQ-VTA-05/§4.7): motivo con al menos 10 caracteres significativos.
 *
 * La anulación desvincula los cobros aplicados (quedan como saldo a favor
 * del cliente, REQ-VTA-07) — la consecuencia se enuncia en el cuerpo.
 *
 * Anti-F-14: la textarea lleva `[field-sizing:fixed] resize-y` OBLIGATORIO —
 * sin eso, shadcn Textarea expande el sheet horizontalmente con líneas largas.
 */
export function AnularVentaSheet({
  open,
  onOpenChange,
  ventaId,
  glosa,
}: AnularVentaSheetProps): React.JSX.Element {
  const navigate = useNavigate();
  const mutation = useAnularVenta(ventaId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AnularVentaValues>({
    resolver: zodResolver(anularVentaSchema),
    defaultValues: { motivo: '' },
  });

  useEffect(() => {
    if (open) reset({ motivo: '' });
  }, [open, reset]);

  function onSubmit(values: AnularVentaValues): void {
    mutation.mutate(values.motivo, {
      onSuccess: () => {
        toast.success('Venta anulada');
        onOpenChange(false);
        void navigate('/ventas');
      },
      onError: (err) => {
        toast.error(mensajeVentas(err, 'No se pudo anular la venta'));
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
          <SheetTitle>Anular venta</SheetTitle>
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
            <Label htmlFor="anular-venta-motivo">Motivo de anulación</Label>
            <Textarea
              id="anular-venta-motivo"
              placeholder="Describí el motivo con al menos 10 caracteres significativos"
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
            La anulación es irreversible. La venta se preserva con marca de
            anulado y su número no se reutiliza. Si tiene cobros aplicados, se
            desvinculan y quedan como saldo a favor del cliente.
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
