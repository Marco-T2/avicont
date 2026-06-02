import { Building2 } from 'lucide-react';

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
import type { PlatformOrg } from '@/types/api';

import { OrgPlanBadge } from '../components/org-plan-badge';
import { OrgStatusBadge } from '../components/org-status-badge';
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
 * Listado de organizaciones de la plataforma (super-admin, PR-1).
 * Container: orquesta useOrgs y maneja loading/empty/error. La creación de orgs
 * y las acciones por fila llegan en PR-2/PR-3.
 */
export function OrgsPage(): React.JSX.Element {
  const { data, isLoading, isError } = useOrgs();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Organizaciones</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Todas las organizaciones de la plataforma.
          </p>
        </div>
      </div>

      <OrgsContent data={data} isLoading={isLoading} isError={isError} />
    </div>
  );
}

interface OrgsContentProps {
  data: PlatformOrg[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

function OrgsContent({ data, isLoading, isError }: OrgsContentProps): React.JSX.Element {
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
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background min-w-[200px]">
              Nombre
            </TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Verticales</TableHead>
            <TableHead>Creada</TableHead>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
