import { Building2, MoreHorizontal, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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
import type { OrgStatus, PlatformOrg } from '@/types/api';

import { CreateOrgSheet } from '../components/create-org-sheet';
import { EntitlementSheet } from '../components/entitlement-sheet';
import { OrgPlanBadge } from '../components/org-plan-badge';
import { OrgStatusBadge } from '../components/org-status-badge';
import { OrgStatusDialog } from '../components/org-status-dialog';
import { useOrgs } from '../hooks/use-orgs';

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
 * Listado de organizaciones de la plataforma (super-admin, PR-1/PR-2/PR-3).
 * Container: orquesta useOrgs y maneja loading/empty/error. PR-2 agrega la creación
 * de orgs (CreateOrgSheet). PR-3 agrega las acciones por fila: cambiar estado
 * (OrgStatusDialog) y editar entitlement (EntitlementSheet).
 */
export function OrgsPage(): React.JSX.Element {
  const { data, isLoading, isError } = useOrgs();
  const [createOpen, setCreateOpen] = useState(false);

  // Acción de status seleccionada: la org + el status destino de la transición.
  const [statusTarget, setStatusTarget] = useState<{
    org: PlatformOrg;
    target: OrgStatus;
  } | null>(null);
  // Org cuyo entitlement se está editando.
  const [entitlementOrg, setEntitlementOrg] = useState<PlatformOrg | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Organizaciones</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Todas las organizaciones de la plataforma.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="self-start">
          <Plus className="h-4 w-4 mr-2" />
          Nueva organización
        </Button>
      </div>

      <OrgsContent
        data={data}
        isLoading={isLoading}
        isError={isError}
        onChangeStatus={(org, target) => setStatusTarget({ org, target })}
        onEditEntitlement={setEntitlementOrg}
      />

      <CreateOrgSheet open={createOpen} onOpenChange={setCreateOpen} />

      <OrgStatusDialog
        org={statusTarget?.org ?? null}
        targetStatus={statusTarget?.target ?? 'ACTIVE'}
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
      />

      <EntitlementSheet
        org={entitlementOrg}
        open={entitlementOrg !== null}
        onOpenChange={(open) => {
          if (!open) setEntitlementOrg(null);
        }}
      />
    </div>
  );
}

interface OrgsContentProps {
  data: PlatformOrg[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onChangeStatus: (org: PlatformOrg, target: OrgStatus) => void;
  onEditEntitlement: (org: PlatformOrg) => void;
}

function OrgsContent({
  data,
  isLoading,
  isError,
  onChangeStatus,
  onEditEntitlement,
}: OrgsContentProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">
          No se pudieron cargar las organizaciones.
        </p>
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

  const orgs = data ?? [];

  if (orgs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
        <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">No hay organizaciones</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Todavía no se creó ninguna organización en la plataforma.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background min-w-[200px]">
              Nombre
            </TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Verticales</TableHead>
            <TableHead>Creada</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orgs.map((org) => (
            <TableRow key={org.id}>
              <TableCell className="sticky left-0 z-10 bg-background">
                <div className="font-medium">{org.name}</div>
                <div className="text-xs text-muted-foreground">{org.slug}</div>
              </TableCell>
              <TableCell>
                <OrgStatusBadge status={org.status} />
              </TableCell>
              <TableCell>
                <OrgPlanBadge plan={org.plan} />
              </TableCell>
              <TableCell>
                <VerticalesBadges
                  contabilidadEnabled={org.contabilidadEnabled}
                  granjaEnabled={org.granjaEnabled}
                />
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {formatearFecha(org.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <OrgRowActions
                  org={org}
                  onChangeStatus={onChangeStatus}
                  onEditEntitlement={onEditEntitlement}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface OrgRowActionsProps {
  org: PlatformOrg;
  onChangeStatus: (org: PlatformOrg, target: OrgStatus) => void;
  onEditEntitlement: (org: PlatformOrg) => void;
}

// Transiciones de status disponibles según el estado actual de la org. El
// backend acepta cualquier status; acá modelamos las transiciones con sentido
// para no ofrecer "suspender" sobre algo ya suspendido.
const TRANSICIONES_STATUS: Record<OrgStatus, { target: OrgStatus; label: string }[]> = {
  ACTIVE: [
    { target: 'SUSPENDED', label: 'Suspender' },
    { target: 'ARCHIVED', label: 'Archivar' },
  ],
  SUSPENDED: [
    { target: 'ACTIVE', label: 'Reactivar' },
    { target: 'ARCHIVED', label: 'Archivar' },
  ],
  ARCHIVED: [{ target: 'ACTIVE', label: 'Reactivar' }],
};

function OrgRowActions({
  org,
  onChangeStatus,
  onEditEntitlement,
}: OrgRowActionsProps): React.JSX.Element {
  const transiciones = TRANSICIONES_STATUS[org.status] ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 md:h-9 md:w-9"
          aria-label={`Acciones para ${org.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link to={`/platform-admin/orgs/${org.id}/members`} className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Ver miembros
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEditEntitlement(org)}>
          Editar entitlement
        </DropdownMenuItem>
        {transiciones.length > 0 ? <DropdownMenuSeparator /> : null}
        {transiciones.map((t) => (
          <DropdownMenuItem key={t.target} onClick={() => onChangeStatus(org, t.target)}>
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface VerticalesBadgesProps {
  contabilidadEnabled: boolean;
  granjaEnabled: boolean;
}

function VerticalesBadges({
  contabilidadEnabled,
  granjaEnabled,
}: VerticalesBadgesProps): React.JSX.Element {
  if (!contabilidadEnabled && !granjaEnabled) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {contabilidadEnabled && (
        <Badge variant="outline" className="text-xs">
          Contabilidad
        </Badge>
      )}
      {granjaEnabled && (
        <Badge variant="outline" className="text-xs">
          Granja
        </Badge>
      )}
    </span>
  );
}
