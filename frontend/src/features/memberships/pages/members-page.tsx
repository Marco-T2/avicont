import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import { PERMISSIONS } from '@/lib/permissions';
import { InvitationsList } from '@/features/invitations/components/invitations-list';
import { useInvitations } from '@/features/invitations/hooks/use-invitations';

import { InviteMemberDialog } from '../components/invite-member-dialog';
import { MembersList } from '../components/members-list';
import { useMembers } from '../hooks/use-memberships';

// /settings/members — página única con dos secciones: miembros activos (con
// cambio de rol + remover) e invitaciones pendientes (con revocar). El
// botón "Invitar miembro" abre un Dialog con form (email + rol).
export function MembersPage(): React.JSX.Element {
  const [inviteOpen, setInviteOpen] = useState(false);

  const membersQuery = useMembers();
  const invitationsQuery = useInvitations('PENDING');

  if (membersQuery.isError) {
    toast.error('No se pudieron cargar los miembros');
  }
  if (invitationsQuery.isError) {
    toast.error('No se pudieron cargar las invitaciones');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Miembros</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Gestioná quién tiene acceso a esta organización y con qué rol.
          </p>
        </div>
        <PermissionButton
          permission={PERMISSIONS.organizacion.miembros.invite}
          deniedReason="No tenés permiso para invitar miembros"
          onClick={() => setInviteOpen(true)}
          className="self-start"
        >
          <Plus className="h-4 w-4 mr-2" />
          Invitar miembro
        </PermissionButton>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Miembros activos
        </h2>
        <MembersList
          members={membersQuery.data ?? []}
          loading={membersQuery.isLoading}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Invitaciones pendientes
        </h2>
        <InvitationsList invitations={invitationsQuery.data ?? []} />
      </section>

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
