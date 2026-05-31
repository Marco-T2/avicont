import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateInvitation } from '@/features/invitations/hooks/use-invitations';
import { backendErrorMessage } from '@/lib/error-messages';

import {
  type InviteFormValues,
  inviteFormSchema,
} from '../schemas/invite-form-schema';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Dialog para invitar a un miembro nuevo por email. Usa el endpoint
// POST /api/invitations (envía email con token). El flujo de aceptación
// vive en la página pública /accept-invite.
//
// Para simplificar el slice, solo exponemos los 2 systemRoles (OWNER, ADMIN).
// Los custom roles se manejarán cuando exista /settings/roles — acá se
// ampliará el select con las opciones dinámicas.
export function InviteMemberDialog({
  open,
  onOpenChange,
}: InviteMemberDialogProps): React.JSX.Element {
  const mutation = useCreateInvitation();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: '',
      roleKind: 'system',
      systemRole: 'ADMIN',
      expiresInDays: 7,
    },
  });

  const systemRole = useWatch({ control, name: 'systemRole' });

  function onSubmit(values: InviteFormValues): void {
    const body = {
      email: values.email,
      ...(values.roleKind === 'system' && values.systemRole !== undefined
        ? { systemRole: values.systemRole }
        : {}),
      ...(values.roleKind === 'custom' && values.customRoleId !== undefined
        ? { customRoleId: values.customRoleId }
        : {}),
      expiresInDays: values.expiresInDays,
    };
    mutation.mutate(body, {
      onSuccess: () => {
        toast.success(`Invitación enviada a ${values.email}`);
        reset();
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(backendErrorMessage(err, 'No se pudo enviar la invitación'));
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar miembro</DialogTitle>
          <DialogDescription>
            Se enviará un email con un link de aceptación. El link expira en
            los días seleccionados.
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="nuevo@empresa.bo"
              autoComplete="email"
              aria-invalid={errors.email !== undefined}
            />
            {errors.email !== undefined ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select
              value={systemRole}
              onValueChange={(v) => {
                setValue('roleKind', 'system');
                setValue('systemRole', v as 'OWNER' | 'ADMIN');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">
                  <div>
                    <p className="font-medium">Admin</p>
                    <p className="text-xs text-muted-foreground">
                      Todos los permisos excepto transferir ownership
                    </p>
                  </div>
                </SelectItem>
                <SelectItem value="OWNER">
                  <div>
                    <p className="font-medium">Owner</p>
                    <p className="text-xs text-muted-foreground">
                      Control total — puede agregar/quitar owners
                    </p>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Los roles personalizados llegan en Configuración → Roles.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expiresInDays">Expira en (días)</Label>
            <Input
              id="expiresInDays"
              type="number"
              min={1}
              max={30}
              aria-invalid={errors.expiresInDays !== undefined}
              {...register('expiresInDays', { valueAsNumber: true })}
              className="max-w-[120px]"
            />
            <p className="text-xs text-muted-foreground">Máximo 30 días.</p>
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
                  Enviando…
                </>
              ) : (
                'Enviar invitación'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
