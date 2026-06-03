import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useState } from 'react';
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

  // Resultado de una invitación creada con éxito. Mientras es null se muestra
  // el formulario; cuando tiene valor se muestra la vista con el enlace copiable.
  const [created, setCreated] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
      onSuccess: (data) => {
        // El backend manda el email automáticamente, pero en dev el "envío" solo
        // loguea el link. Exponemos el enlace para que el admin lo copie y lo
        // comparta a mano sin tener que buscarlo en los logs.
        setCreated({
          link: `${window.location.origin}/accept-invite?token=${data.token}`,
          email: values.email,
        });
        reset();
      },
      onError: (err) => {
        toast.error(backendErrorMessage(err, 'No se pudo enviar la invitación'));
      },
    });
  }

  function handleOpenChange(next: boolean): void {
    if (!next) {
      setCreated(null);
      setCopied(false);
      reset();
    }
    onOpenChange(next);
  }

  function handleInviteAnother(): void {
    setCreated(null);
    setCopied(false);
  }

  async function handleCopy(): Promise<void> {
    if (created === null) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      toast.success('Enlace copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar. Seleccioná el enlace y copialo manualmente.');
    }
  }

  const systemRoles = roles.filter((r) => r.kind === 'system');
  const customRoles = roles.filter((r) => r.kind === 'custom');

  if (created !== null) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitación creada</DialogTitle>
            <DialogDescription>
              Se envió un email a{' '}
              <span className="font-medium text-foreground">{created.email}</span>.
              También podés copiar el enlace y compartirlo a mano.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-link">Enlace de invitación</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  readOnly
                  value={created.link}
                  className="text-base md:text-sm font-mono"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label="Copiar enlace"
                  onClick={() => {
                    void handleCopy();
                  }}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                El enlace expira según los días configurados al invitar.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleInviteAnother}>
              Invitar a otro
            </Button>
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
