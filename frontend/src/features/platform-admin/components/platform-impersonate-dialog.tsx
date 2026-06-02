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

import { useStartImpersonation } from '../../impersonation/hooks/use-impersonation';
import {
  type ImpersonateFormValues,
  impersonateSchema,
} from '../../impersonation/schemas/impersonate-schema';

interface PlatformImpersonateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El miembro que se va a impersonar. */
  targetUser: { id: string; email: string; displayName: string | null };
  /** La organización desde la que el super-admin inicia la impersonation. */
  orgId: string;
}

/**
 * Dialog de impersonation para el panel super-admin.
 * Reusa el schema y el hook de ImpersonateDialog, pero agrega organizationId
 * para que el SA org-less pueda especificar la org target.
 *
 * Al éxito: el hook setea el token del target y navega a "/" →
 * IndexRedirect lleva al DashboardShell del target con el banner visible.
 *
 * REQ-PAUI-13 — Slice 2 del change platform-admin-v1.1.
 */
export function PlatformImpersonateDialog({
  open,
  onOpenChange,
  targetUser,
  orgId,
}: PlatformImpersonateDialogProps): React.JSX.Element {
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
    mutation.mutate(
      {
        targetUserId: targetUser.id,
        reason: values.reason,
        organizationId: orgId,
      },
      {
        onSuccess: () => {
          toast.success(
            `Estás operando como ${targetUser.displayName ?? targetUser.email}`,
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

  const displayName = targetUser.displayName ?? targetUser.email;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Impersonar a {displayName}</DialogTitle>
          <DialogDescription>
            Iniciarás sesión como{' '}
            <span className="font-medium">{targetUser.email}</span> en la
            organización seleccionada. Toda acción queda registrada con tu ID de
            admin. La sesión dura 30 minutos y no se puede refrescar.
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
            <Label htmlFor="platform-imp-reason">Razón (mínimo 10 caracteres)</Label>
            <Textarea
              id="platform-imp-reason"
              rows={3}
              placeholder="Soporte: usuario reporta no ver comprobantes de marzo"
              aria-invalid={errors.reason !== undefined}
              className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[72px]"
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
