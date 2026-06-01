import { XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { backendErrorMessage } from '@/lib/error-messages';
import { PERMISSIONS } from '@/lib/permissions';
import type { Invitation } from '@/types/api';

import { useRevokeInvitation } from '../hooks/use-invitations';

interface InvitationsListProps {
  invitations: Invitation[];
}

function formatFecha(iso: string): string {
  // CLAUDE.md §4.6: timestamps storage en UTC, presentación en America/La_Paz.
  return new Date(iso).toLocaleDateString('es-BO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/La_Paz',
  });
}

export function InvitationsList({
  invitations,
}: InvitationsListProps): React.JSX.Element {
  const revoke = useRevokeInvitation();

  if (invitations.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay invitaciones pendientes.
        </p>
      </div>
    );
  }

  function handleRevoke(inv: Invitation): void {
    const ok = window.confirm(`¿Revocar la invitación a ${inv.email}?`);
    if (!ok) return;
    revoke.mutate(inv.id, {
      onSuccess: () => toast.success('Invitación revocada'),
      onError: (err) =>
        toast.error(backendErrorMessage(err, 'No se pudo revocar')),
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-[600px]">
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Expira</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-medium">{inv.email}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {inv.systemRole ?? 'CustomRole'}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatFecha(inv.expiresAt)}
              </TableCell>
              <TableCell className="text-right">
                <PermissionButton
                  permission={PERMISSIONS.organizacion.miembros.invite}
                  deniedReason="No tenés permiso para revocar invitaciones"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 md:h-9 md:w-9"
                  aria-label={`Revocar invitación a ${inv.email}`}
                  onClick={() => handleRevoke(inv)}
                  disabled={revoke.isPending}
                >
                  <XCircle className="h-4 w-4" />
                </PermissionButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
