import { useState } from 'react';
import { UserCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthStore } from '@/stores/auth-store';
import type { PlatformOrgMember } from '@/types/api';

import { PlatformImpersonateDialog } from './platform-impersonate-dialog';

interface PlatformMembersTableProps {
  members: PlatformOrgMember[];
  orgId: string;
}

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
 * Tabla presentacional de miembros para el panel super-admin.
 * Incluye botón "Impersonar" por fila con gating:
 * - No se puede impersonar a un OWNER (refleja invariante del backend).
 * - No se puede impersonar a sí mismo (el SA).
 *
 * REQ-PAUI-12 — Slice 2 del change platform-admin-v1.1.
 */
export function PlatformMembersTable({
  members,
  orgId,
}: PlatformMembersTableProps): React.JSX.Element {
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [dialogTarget, setDialogTarget] = useState<PlatformOrgMember['user'] | null>(null);

  const puedeImpersonar = (member: PlatformOrgMember): boolean => {
    // No impersonar a OWNER (backend también lo rechazaría)
    if (member.systemRole === 'OWNER') return false;
    // No auto-impersonar
    if (member.userId === currentUserId) return false;
    // No impersonar a desactivados (backend también lo rechazaría)
    if (member.deactivatedAt !== null) return false;
    return true;
  };

  return (
    <>
      <div className="relative overflow-x-auto rounded-md border">
        <Table className="min-w-[780px]">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background min-w-[220px]">
                Usuario
              </TableHead>
              <TableHead>Rol sistema</TableHead>
              <TableHead>Rol personalizado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Miembro desde</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                puedeImpersonar={puedeImpersonar(member)}
                onImpersonar={() => setDialogTarget(member.user)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <PlatformImpersonateDialog
        open={dialogTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDialogTarget(null);
        }}
        targetUser={dialogTarget ?? { id: '', email: '', displayName: null }}
        orgId={orgId}
      />
    </>
  );
}

interface MemberRowProps {
  member: PlatformOrgMember;
  puedeImpersonar: boolean;
  onImpersonar: () => void;
}

function MemberRow({
  member,
  puedeImpersonar,
  onImpersonar,
}: MemberRowProps): React.JSX.Element {
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
      <TableCell className="text-right">
        {puedeImpersonar ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onImpersonar}
            aria-label={`Impersonar a ${member.user.displayName ?? member.user.email}`}
          >
            <UserCheck className="h-4 w-4 mr-1" />
            Impersonar
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
