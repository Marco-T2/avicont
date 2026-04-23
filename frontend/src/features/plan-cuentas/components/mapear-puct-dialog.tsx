import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { backendErrorMessage } from '@/lib/error-messages';
import type { Cuenta } from '@/types/api';

import { useMapearPuct } from '../hooks/use-cuenta-mutations';

// Formato del PUCT oficial: 4 segmentos numéricos (nivel 4 obligatorio).
// Regex replicado del backend (validarNivelPuct). El backend valida existencia
// contra CatalogoPuct y devuelve CUENTA_CODIGO_PUCT_INVALIDO si no existe.
const schema = z.object({
  codigoPuct: z
    .string()
    .min(1, 'El código PUCT es obligatorio')
    .regex(
      /^\d+\.\d+\.\d+\.\d+$/,
      'Formato: 4 segmentos numéricos separados por punto (ej. "1.1.1.001")',
    ),
});
type FormValues = z.infer<typeof schema>;

interface MapearPuctDialogProps {
  cuenta: Cuenta | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MapearPuctDialog({
  cuenta,
  open,
  onOpenChange,
}: MapearPuctDialogProps): React.JSX.Element {
  const mutation = useMapearPuct(cuenta?.id ?? null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { codigoPuct: cuenta?.codigoPuct ?? '' },
    values: { codigoPuct: cuenta?.codigoPuct ?? '' },
  });

  function onSubmit(values: FormValues): void {
    mutation.mutate(values.codigoPuct, {
      onSuccess: (updated) => {
        toast.success(
          `PUCT ${values.codigoPuct} mapeado — "${updated.nombrePuctSnapshot ?? ''}"`,
        );
        reset();
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(backendErrorMessage(err, 'No se pudo mapear el PUCT'));
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {cuenta?.codigoPuct !== null && cuenta?.codigoPuct !== undefined
              ? 'Cambiar código PUCT'
              : 'Mapear código PUCT'}
          </DialogTitle>
          <DialogDescription>
            El código PUCT debe ser nivel 4 del catálogo oficial
            (RND 101800000004). Al mapear, el frontend captura el nombre y la
            versión vigente del catálogo como snapshot.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="codigoPuct">Código PUCT</Label>
            <Input
              id="codigoPuct"
              {...register('codigoPuct')}
              placeholder="1.1.1.001"
              autoComplete="off"
              aria-invalid={errors.codigoPuct !== undefined}
            />
            {errors.codigoPuct !== undefined ? (
              <p className="text-xs text-destructive">
                {errors.codigoPuct.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Si el código no existe en el catálogo, el servidor rechaza el
                mapeo.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Mapeando…
                </>
              ) : (
                'Mapear'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
