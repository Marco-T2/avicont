import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ImpersonateDialog } from '@/features/impersonation/components/impersonate-dialog';
import { backendErrorMessage } from '@/lib/error-messages';
import { useAuthStore } from '@/stores/auth-store';
import type { Membership } from '@/types/api';

import {
  useChangeMembershipRole,
  useRemoveMembership,
} from '../hooks/use-memberships';

interface MembersListProps {
  members: Membership[];
  loading?: boolean;
}

// Tabla de miembros actuales del tenant. Dropdown de acciones por fila:
// cambiar a OWNER/ADMIN, remover. El backend valida que no se remueva
// al último OWNER (ForbiddenException con mensaje claro).
export function MembersList({
  members,
  loading = false,
}: MembersListProps): React.JSX.Element {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentRoles = useAuthStore((s) => s.user?.roles ?? []);
  const isOwner = currentRoles.includes('OWNER');
  const changeRole = useChangeMembershipRole();
  const removeMember = useRemoveMembership();
  const [impersonateTarget, setImpersonateTarget] = useState<Membership | null>(
    null,
  );

  if (loading && members.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay miembros todavía. Invitá a alguien con el botón de arriba.
        </p>
      </div>
    );
  }

  function handleChangeRole(m: Membership, systemRole: 'OWNER' | 'ADMIN'): void {
    changeRole.mutate(
      { id: m.id, systemRole },
      {
        onSuccess: () => toast.success(`Rol actualizado a ${systemRole}`),
        onError: (err) =>
          toast.error(backendErrorMessage(err, 'No se pudo cambiar el rol')),
      },
    );
  }

  function handleRemove(m: Membership): void {
    const ok = window.confirm(
      `¿Quitar a ${m.user.email} de la organización?\n\nLos movimientos históricos se preservan.`,
    );
    if (!ok) return;
    removeMember.mutate(m.id, {
      onSuccess: () => toast.success(`${m.user.email} removido`),
      onError: (err) =>
        toast.error(backendErrorMessage(err, 'No se pudo remover el miembro')),
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-[600px]">
        <TableHeader>
          <TableRow>
            <TableHead>Miembro</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            const roleLabel =
              m.systemRole ?? m.customRole?.name ?? 'Sin rol';
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.user.displayName ?? m.user.email}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-muted-foreground italic">
                          (vos)
                        </span>
                      ) : null}
                    </p>
                    {m.user.displayName !== null ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {m.user.email}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{roleLabel}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 md:h-9 md:w-9"
                        aria-label={`Acciones para ${m.user.email}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        disabled={
                          m.systemRole === 'ADMIN' || changeRole.isPending
                        }
                        onClick={() => handleChangeRole(m, 'ADMIN')}
                      >
                        Cambiar a Admin
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={
                          m.systemRole === 'OWNER' || changeRole.isPending
                        }
                        onClick={() => handleChangeRole(m, 'OWNER')}
                      >
                        Cambiar a Owner
                      </DropdownMenuItem>
                      {isOwner ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isSelf || m.systemRole === 'OWNER'}
                            onClick={() => setImpersonateTarget(m)}
                          >
                            Impersonar…
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={isSelf || removeMember.isPending}
                        onClick={() => handleRemove(m)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        Remover de la organización
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ImpersonateDialog
        target={impersonateTarget}
        onOpenChange={(o) => {
          if (!o) setImpersonateTarget(null);
        }}
      />
    </div>
  );
}
