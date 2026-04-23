import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
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
import { backendErrorMessage } from '@/lib/error-messages';
import type { Membership } from '@/types/api';

import { useStartImpersonation } from '../hooks/use-impersonation';
import {
  type ImpersonateFormValues,
  impersonateSchema,
} from '../schemas/impersonate-schema';

interface ImpersonateDialogProps {
  target: Membership | null;
  onOpenChange: (open: boolean) => void;
}

// Dialog que recoge la razón de la impersonation y dispara el flujo. Al éxito,
// redirige al home — el banner global se encarga de mostrar el estado.
export function ImpersonateDialog({
  target,
  onOpenChange,
}: ImpersonateDialogProps): React.JSX.Element {
  const mutation = useStartImpersonation();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ImpersonateFormValues>({
    resolver: zodResolver(impersonateSchema),
    defaultValues: { reason: '' },
  });

  function onSubmit(values: ImpersonateFormValues): void {
    if (target === null) return;
    mutation.mutate(
      { targetUserId: target.userId, reason: values.reason },
      {
        onSuccess: () => {
          toast.success(
            `Estás operando como ${target.user.displayName ?? target.user.email}`,
          );
          reset();
          onOpenChange(false);
          navigate('/', { replace: true });
        },
        onError: (err) => {
          toast.error(
            backendErrorMessage(err, 'No se pudo iniciar la impersonation'),
          );
        },
      },
    );
  }

  const open = target !== null;
  const email = target?.user.email ?? '';
  const displayName = target?.user.displayName ?? email;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Impersonar a {displayName}</DialogTitle>
          <DialogDescription>
            Iniciarás sesión como <span className="font-medium">{email}</span>.
            Toda acción queda registrada con tu ID de admin. La sesión dura 30
            minutos y no se puede refrescar.
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
            <Label htmlFor="reason">Razón (mínimo 10 caracteres)</Label>
            <Textarea
              id="reason"
              rows={3}
              placeholder="Soporte: usuario reporta no ver comprobantes de marzo"
              aria-invalid={errors.reason !== undefined}
              {...register('reason')}
            />
            {errors.reason !== undefined ? (
              <p className="text-xs text-destructive">
                {errors.reason.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Queda registrada en el log permanente de impersonations.
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
                  Iniciando…
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" />
                  Iniciar impersonation
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
