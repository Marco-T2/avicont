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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mensajePeriodosFiscales } from '@/lib/error-messages';
import type { TipoEmpresa } from '@/types/api';

import { useCrearGestion } from '../hooks/use-crear-gestion';
import { derivarRangoGestion } from '../lib/derivar-rango-gestion';
import {
  nuevaGestionSchema,
  type NuevaGestionValues,
} from '../schemas/nueva-gestion-schema';

interface NuevaGestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipoEmpresa: TipoEmpresa | null;
}

export function NuevaGestionDialog({
  open,
  onOpenChange,
  tipoEmpresa,
}: NuevaGestionDialogProps): React.JSX.Element {
  const mutation = useCrearGestion();
  const currentYear = new Date().getFullYear();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<NuevaGestionValues>({
    resolver: zodResolver(nuevaGestionSchema),
    defaultValues: { year: currentYear },
  });

  // Resetear el form cuando se cierra/abre el dialog.
  useEffect(() => {
    if (open) reset({ year: currentYear });
  }, [open, currentYear, reset]);

  const yearValue = watch('year');

  function textoEducativo(): string {
    if (tipoEmpresa === null || typeof yearValue !== 'number' || Number.isNaN(yearValue)) {
      return 'El sistema derivará el mes inicial según el tipo de empresa de tu organización.';
    }
    const rango = derivarRangoGestion(tipoEmpresa, yearValue);
    return `Tu organización es ${tipoEmpresa}. La gestión irá de ${rango}.`;
  }

  function onSubmit(values: NuevaGestionValues): void {
    mutation.mutate(values, {
      onSuccess: () => {
        toast.success(`Gestión ${values.year} creada correctamente`);
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(mensajePeriodosFiscales(err));
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva gestión fiscal</DialogTitle>
          <DialogDescription>
            Ingresá el año de la gestión. El sistema derivará los 12 períodos
            automáticamente según el tipo de empresa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nueva-gestion-year">Año</Label>
            <Input
              id="nueva-gestion-year"
              type="number"
              className="text-base md:text-sm"
              aria-invalid={errors.year !== undefined}
              {...register('year', { valueAsNumber: true })}
            />
            {errors.year !== undefined && (
              <p className="text-sm text-destructive">{errors.year.message}</p>
            )}
          </div>

          <p className="text-sm text-muted-foreground rounded-md bg-muted px-3 py-2">
            {textoEducativo()}
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
                  Creando…
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
