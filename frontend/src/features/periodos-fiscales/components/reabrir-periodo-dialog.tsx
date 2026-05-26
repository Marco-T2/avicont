import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { mensajePeriodosFiscales } from '@/lib/error-messages';

import { useReabrirPeriodo } from '../hooks/use-reabrir-periodo';
import {
  reabrirPeriodoSchema,
  type ReabrirPeriodoValues,
} from '../schemas/reabrir-periodo-schema';

interface ReabrirPeriodoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodoId: string | null;
  nombrePeriodo: string;
}

export function ReabrirPeriodoDialog({
  open,
  onOpenChange,
  periodoId,
  nombrePeriodo,
}: ReabrirPeriodoDialogProps): React.JSX.Element {
  const mutation = useReabrirPeriodo();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ReabrirPeriodoValues>({
    resolver: zodResolver(reabrirPeriodoSchema),
    defaultValues: { motivo: '' },
  });

  // Resetear el form cuando cambia el período o se cierra.
  useEffect(() => {
    if (open) reset({ motivo: '' });
  }, [open, periodoId, reset]);

  const motivoValue = watch('motivo') ?? '';
  // Contar caracteres sobre el valor sin trim, para dar feedback real-time.
  const charCount = motivoValue.length;

  function onSubmit(values: ReabrirPeriodoValues): void {
    if (periodoId === null) return;
    mutation.mutate(
      { id: periodoId, ...values },
      {
        onSuccess: () => {
          toast.success(`Período ${nombrePeriodo} reabierto correctamente`);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(mensajePeriodosFiscales(err));
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir período</DialogTitle>
          <DialogDescription>
            Vas a reabrir <strong>{nombrePeriodo}</strong>. Esta acción se
            audita y queda registrada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reabrir-motivo">Motivo</Label>
            <Textarea
              id="reabrir-motivo"
              placeholder="Describí el motivo de la reapertura (mínimo 20 caracteres)"
              // `[field-sizing:fixed]` corta el auto-grow horizontal del primitivo
              // shadcn (default field-sizing-content) — sin esto, una línea
              // larga sin espacios empuja el textarea fuera del dialog.
              // `resize-y` deja al user agrandar verticalmente pero no horizontalmente.
              className="text-base md:text-sm min-h-[80px] w-full max-w-full resize-y [field-sizing:fixed]"
              aria-invalid={errors.motivo !== undefined}
              {...register('motivo')}
            />
            <div className="flex items-center justify-between">
              {errors.motivo !== undefined ? (
                <p className="text-sm text-destructive">{errors.motivo.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted-foreground tabular-nums">
                {charCount} / 20
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
            Esta acción se audita y queda registrada en el historial.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reabriendo…
                </>
              ) : (
                'Confirmar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
