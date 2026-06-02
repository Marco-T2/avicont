import { Users } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import type { PlatformOrgMember } from '@/types/api';

import { PlatformMembersTable } from '../components/platform-members-table';
import { useOrgMembers } from '../hooks/use-org-members';

/**
 * Página de miembros de una organización para el panel super-admin.
 * Slice 1: lista miembros (activos + desactivados).
 * Slice 2: integra PlatformMembersTable con botón "Impersonar" por fila.
 *
 * REQ-PM-02, REQ-PAUI-12 — change platform-admin-v1.1.
 */
export function OrgMembersPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useOrgMembers(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Miembros</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Miembros de la organización (activos y desactivados).
          </p>
        </div>
      </div>

      <MembersContent data={data} isLoading={isLoading} isError={isError} orgId={id} />
    </div>
  );
}

interface MembersContentProps {
  data: PlatformOrgMember[] | undefined;
  isLoading: boolean;
  isError: boolean;
  orgId: string;
}

function MembersContent({
  data,
  isLoading,
  isError,
  orgId,
}: MembersContentProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">No se pudieron cargar los miembros.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const miembros = data ?? [];

  if (miembros.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
        <Users className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">No hay miembros</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta organización no tiene miembros todavía.
        </p>
      </div>
    );
  }

  return <PlatformMembersTable members={miembros} orgId={orgId} />;
}
