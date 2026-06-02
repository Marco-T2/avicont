import { Users } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PlatformOrgMember } from '@/types/api';

import { useOrgMembers } from '../hooks/use-org-members';

const FECHA_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return FECHA_FORMATTER.format(fecha);
}

/**
 * Página de miembros de una organización para el panel super-admin.
 * Consume useOrgMembers(id) y muestra tabla con columnas:
 * email, displayName, systemRole, customRole, estado, createdAt.
 *
 * REQ-PM-02 — Slice 1 del change platform-admin-v1.1.
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

      <MembersContent data={data} isLoading={isLoading} isError={isError} />
    </div>
  );
}

interface MembersContentProps {
  data: PlatformOrgMember[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

function MembersContent({ data, isLoading, isError }: MembersContentProps): React.JSX.Element {
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

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background min-w-[220px]">
              Usuario
            </TableHead>
            <TableHead>Rol sistema</TableHead>
            <TableHead>Rol personalizado</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Miembro desde</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {miembros.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface MemberRowProps {
  member: PlatformOrgMember;
}

function MemberRow({ member }: MemberRowProps): React.JSX.Element {
  const desactivado = member.deactivatedAt !== null;

  return (
    <TableRow className={desactivado ? 'opacity-60' : undefined}>
      <TableCell className="sticky left-0 z-10 bg-background">
        <div className="font-medium">{member.user.email}</div>
        {member.user.displayName !== null ? (
          <div className="text-xs text-muted-foreground">{member.user.displayName}</div>
        ) : null}
      </TableCell>
      <TableCell>
        {member.systemRole !== null ? (
          <span className="text-sm font-mono">{member.systemRole}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {member.customRole !== null ? (
          <Badge variant="outline" className="text-xs">
            {member.customRole.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {desactivado ? (
          <Badge variant="secondary" className="text-xs">
            Desactivado
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
            Activo
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {formatearFecha(member.createdAt)}
      </TableCell>
    </TableRow>
  );
}
