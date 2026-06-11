import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { OrgPackEntitlement, Pack, PlatformOrg } from '@/types/api';

import { useHabilitarPack } from '../hooks/use-habilitar-pack';
import { useOrgPacks } from '../hooks/use-org-packs';
import { usePacksCatalogo } from '../hooks/use-packs-catalogo';
import { useRevocarPack } from '../hooks/use-revocar-pack';

export interface OrgPacksSheetProps {
  org: PlatformOrg | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Sheet derecho que lista el catálogo de packs filtrado por el vertical de la org,
 * cruzado con los entitlements actuales. Permite habilitar y revocar packs (super-admin).
 *
 * Filtro vertical (D-04): deriva vertical de org.contabilidadEnabled/granjaEnabled.
 * El backend valida el vertical al habilitar (defensa real).
 * Acciones reversibles: botón "Revocar" es variant=outline, NO destructive (§14.4).
 */
export function OrgPacksSheet({
  org,
  open,
  onOpenChange,
}: OrgPacksSheetProps): React.JSX.Element {
  const catalogoQuery = usePacksCatalogo();
  const orgPacksQuery = useOrgPacks(org?.id ?? null);
  const habilitarMutation = useHabilitarPack();
  const revocarMutation = useRevocarPack();

  // D-04: derivar vertical de la org para filtrar el catálogo.
  const verticalOrg: 'CONTABILIDAD' | 'GRANJA' | null = org?.contabilidadEnabled
    ? 'CONTABILIDAD'
    : org?.granjaEnabled
      ? 'GRANJA'
      : null;

  // Solo packs activos del vertical de la org.
  const catalogoVisible = (catalogoQuery.data ?? []).filter(
    (p) => verticalOrg !== null && p.verticalAplicable === verticalOrg && p.activo,
  );

  // Mapa packId → entitlement para cruce O(1).
  const habilitadosByPackId = new Map(
    (orgPacksQuery.data ?? []).map((e) => [e.packId, e]),
  );

  const isLoading = catalogoQuery.isLoading || orgPacksQuery.isLoading;
  const isError = catalogoQuery.isError || orgPacksQuery.isError;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>Packs de «{org?.name ?? ''}»</SheetTitle>
          <SheetDescription>
            Habilitá o revocá packs para esta organización. Los packs habilitados
            quedan inactivos hasta que el Owner los active.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive">
                No se pudieron cargar los packs. Intentá de nuevo.
              </p>
            </div>
          ) : verticalOrg === null ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Esta organización no tiene un vertical activo; no hay packs aplicables.
              </p>
            </div>
          ) : catalogoVisible.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay packs disponibles para el vertical de esta organización.
              </p>
            </div>
          ) : (
            catalogoVisible.map((pack) => {
              const entitlement = habilitadosByPackId.get(pack.id);
              return (
                <OrgPackRow
                  key={pack.id}
                  pack={pack}
                  entitlement={entitlement}
                  orgId={org?.id ?? ''}
                  habilitarMutation={habilitarMutation}
                  revocarMutation={revocarMutation}
                />
              );
            })
          )}
        </div>

        <SheetFooter className="px-4 pb-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface OrgPackRowProps {
  pack: Pack;
  entitlement: OrgPackEntitlement | undefined;
  orgId: string;
  habilitarMutation: ReturnType<typeof useHabilitarPack>;
  revocarMutation: ReturnType<typeof useRevocarPack>;
}

function OrgPackRow({
  pack,
  entitlement,
  orgId,
  habilitarMutation,
  revocarMutation,
}: OrgPackRowProps): React.JSX.Element {
  const isHabilitado = entitlement !== undefined;
  const isPending = habilitarMutation.isPending || revocarMutation.isPending;

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border bg-card p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{pack.nombre}</span>
          <Badge variant="secondary" className="text-xs">
            {pack.tipo === 'CAPACIDAD' ? 'Capacidad' : 'Dominio'}
          </Badge>
          {isHabilitado ? (
            <Badge variant="outline" className="text-xs text-green-700 border-green-300">
              Habilitado
            </Badge>
          ) : null}
          {isHabilitado && entitlement.activo ? (
            <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">
              Activo
            </Badge>
          ) : null}
        </div>
        {pack.descripcion !== null ? (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{pack.descripcion}</p>
        ) : null}
        <code className="mt-1 text-xs text-muted-foreground">{pack.clave}</code>
      </div>

      <div className="flex-shrink-0">
        {isHabilitado ? (
          <Button
            variant="outline"
            size="sm"
            className="h-11 md:h-9"
            disabled={isPending}
            onClick={() =>
              revocarMutation.mutate({ orgId, packId: entitlement.id })
            }
          >
            Revocar
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="h-11 md:h-9"
            disabled={isPending}
            onClick={() =>
              habilitarMutation.mutate({ orgId, clave: pack.clave })
            }
          >
            Habilitar
          </Button>
        )}
      </div>
    </div>
  );
}
