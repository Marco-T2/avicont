import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateInvitation } from '@/features/invitations/hooks/use-invitations';
import { backendErrorMessage } from '@/lib/error-messages';

import { useAssignableRoles } from '../hooks/use-assignable-roles';
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
// Los roles se cargan dinámicamente desde GET /api/memberships/roles-asignables
// cuando el dialog está abierto. Se muestran en dos grupos: Sistema y Personalizados.
export function InviteMemberDialog({
  open,
  onOpenChange,
}: InviteMemberDialogProps): React.JSX.Element {
  const mutation = useCreateInvitation();

  // G-9: hooks se azan a const top-level, nunca inline en JSX.
  const { data: roles = [], isLoading: rolesLoading, isError: rolesError } = useAssignableRoles(open);

  const {
    register,
    handleSubmit,
    setValue,
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

  // Valor compuesto para el select: `${kind}:${id}` (ej. "system:ADMIN", "custom:uuid-1").
  // Los UUIDs v4 no contienen ':', por lo que el split(':') es seguro.
  const selectDefaultValue = 'system:ADMIN';

  function handleRoleChange(v: string): void {
    const colonIdx = v.indexOf(':');
    const kind = v.slice(0, colonIdx);
    const id = v.slice(colonIdx + 1);

    if (kind === 'system') {
      setValue('roleKind', 'system');
      setValue('systemRole', id as 'OWNER' | 'ADMIN');
      setValue('customRoleId', undefined);
    } else {
      setValue('roleKind', 'custom');
      setValue('customRoleId', id);
      setValue('systemRole', undefined);
    }
  }

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

  const systemRoles = roles.filter((r) => r.kind === 'system');
  const customRoles = roles.filter((r) => r.kind === 'custom');

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
            {/* Anti-F-13: error de query como texto inline, nunca toast fuera de handler */}
            {rolesError ? (
              <p className="text-xs text-destructive">
                No se pudieron cargar los roles. Intentá de nuevo.
              </p>
            ) : null}
            <Select
              disabled={rolesLoading}
              defaultValue={selectDefaultValue}
              onValueChange={handleRoleChange}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={rolesLoading ? 'Cargando roles…' : 'Seleccioná un rol'}
                />
              </SelectTrigger>
              <SelectContent>
                {systemRoles.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Sistema</SelectLabel>
                    {systemRoles.map((role) => (
                      <SelectItem key={role.id} value={`system:${role.id}`}>
                        <div>
                          <p className="font-medium">{role.name}</p>
                          {role.description !== undefined ? (
                            <p className="text-xs text-muted-foreground">
                              {role.description}
                            </p>
                          ) : null}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {customRoles.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Personalizados</SelectLabel>
                    {customRoles.map((role) => (
                      <SelectItem key={role.id} value={`custom:${role.id}`}>
                        <div>
                          <p className="font-medium">{role.name}</p>
                          {role.description !== undefined ? (
                            <p className="text-xs text-muted-foreground">
                              {role.description}
                            </p>
                          ) : null}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={mutation.isPending || rolesLoading}>
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
