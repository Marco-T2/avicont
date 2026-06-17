import { BookX } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PERMISSIONS } from '@/lib/permissions';
import { mensajeCierreEjercicio } from '@/lib/error-messages';

import { AsientoCierreCard } from '../components/asiento-cierre-card';
import { CierreConfirmadoBanner } from '../components/cierre-confirmado-banner';
import { ContabilizarCierreBar } from '../components/contabilizar-cierre-bar';
import { useCierre } from '../hooks/use-cierre';
import { useContabilizarCierre } from '../hooks/use-contabilizar-cierre';
import { useGenerarCierre } from '../hooks/use-generar-cierre';
import { derivarEstadoCierre } from '../lib/derivar-estado-cierre';

function PageSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/**
 * Página contenedora del flujo de cierre del ejercicio fiscal.
 * Orquesta useCierre, useGenerarCierre, useContabilizarCierre y deriva el estado
 * de la pantalla sin useState adicional (Anti-F-02).
 *
 * Ruta: /gestiones/:id/cierre
 * Gating: contabilidad.gestiones.read (en router.tsx)
 */
export function CierreEjercicioPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useCierre(id);

  // El estado se DERIVA, no se almacena (Anti-F-02).
  const estadoCierre = data !== undefined ? derivarEstadoCierre(data.cierres) : null;

  const generarMutation = useGenerarCierre(id ?? '');
  const { contabilizar, progreso, isPending: isPendingContabilizar } = useContabilizarCierre(
    id ?? '',
  );

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Cierre del ejercicio</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Generá y contabilizá los asientos de cierre del ejercicio fiscal.
          </p>
        </div>
        <PageSkeleton />
      </div>
    );
  }

  // ── Error / 404 ───────────────────────────────────────────────────────────
  if (isError || data === undefined) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3"
        >
          <p className="text-sm text-destructive">No se encontró la gestión solicitada.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void navigate('/periodos-fiscales')}
        >
          Volver a gestiones
        </Button>
      </div>
    );
  }

  const cierres = data.cierres;

  return (
    <div className="space-y-6">
      {/* Header canónico §13.1 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Cierre del ejercicio</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Generá, revisá y contabilizá los asientos de cierre del ejercicio fiscal.
          </p>
        </div>
      </div>

      {/* ── Estado: SIN_CIERRES ──────────────────────────────────────────── */}
      {estadoCierre === 'SIN_CIERRES' && (
        <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <BookX className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">No hay asientos de cierre generados</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generá los asientos de cierre para revisar y contabilizarlos.
          </p>
          <div className="mt-4">
            <PermissionButton
              permission={PERMISSIONS.contabilidad.gestiones.cerrar}
              deniedReason="No tenés permiso para generar el cierre del ejercicio"
              onClick={() => {
                generarMutation.mutate(undefined, {
                  onError: (err) => toast.error(mensajeCierreEjercicio(err)),
                });
              }}
              disabled={generarMutation.isPending}
            >
              {generarMutation.isPending ? 'Generando…' : 'Generar asientos de cierre'}
            </PermissionButton>
          </div>
        </div>
      )}

      {/* ── Estados EN_BORRADOR y PARCIALMENTE_CONTABILIZADO ─────────────── */}
      {(estadoCierre === 'EN_BORRADOR' || estadoCierre === 'PARCIALMENTE_CONTABILIZADO') && (
        <div className="space-y-4">
          {/* Banner informativo — solo en estado parcial (D-3) */}
          {estadoCierre === 'PARCIALMENTE_CONTABILIZADO' && (
            <div className="rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">El cierre quedó parcialmente contabilizado.</p>
              <p>Volvé a contabilizar para completar los asientos pendientes.</p>
            </div>
          )}

          {/* Cards de preview (SKIP-on-zero: itera cierres tal como vienen) */}
          {cierres.map((cierre) => (
            <AsientoCierreCard key={cierre.id} cierre={cierre} />
          ))}

          {/* Acciones */}
          <div className="flex flex-wrap gap-3 items-center">
            {estadoCierre === 'PARCIALMENTE_CONTABILIZADO' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span: un button deshabilitado tiene pointer-events:none
                      y nunca dispararía el hover del tooltip. */}
                  <span className="inline-flex">
                    <PermissionButton
                      permission={PERMISSIONS.contabilidad.gestiones.cerrar}
                      deniedReason="No tenés permiso para regenerar el cierre"
                      disabled
                      variant="outline"
                    >
                      Regenerar
                    </PermissionButton>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  No se puede regenerar: al menos un asiento de cierre ya está contabilizado.
                </TooltipContent>
              </Tooltip>
            ) : (
              <PermissionButton
                permission={PERMISSIONS.contabilidad.gestiones.cerrar}
                deniedReason="No tenés permiso para regenerar el cierre"
                onClick={() => {
                  generarMutation.mutate(undefined, {
                    onError: (err) => toast.error(mensajeCierreEjercicio(err)),
                  });
                }}
                disabled={generarMutation.isPending}
                variant="outline"
              >
                {generarMutation.isPending ? 'Regenerando…' : 'Regenerar'}
              </PermissionButton>
            )}
          </div>

          <ContabilizarCierreBar
            cierres={cierres}
            progreso={progreso}
            isPending={isPendingContabilizar}
            onContabilizar={() => void contabilizar(cierres)}
          />
        </div>
      )}

      {/* ── Estado: TODOS_CONTABILIZADO ──────────────────────────────────── */}
      {estadoCierre === 'TODOS_CONTABILIZADO' && (
        <div className="space-y-4">
          {/* Cards con badge CONTABILIZADO */}
          {cierres.map((cierre) => (
            <AsientoCierreCard key={cierre.id} cierre={cierre} />
          ))}

          <CierreConfirmadoBanner />
        </div>
      )}
    </div>
  );
}
