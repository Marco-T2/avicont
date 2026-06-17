import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
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
import { mensajePeriodosFiscales } from '@/lib/error-messages';
import { usePuedeReabrir } from '@/lib/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { BorradorPendiente, PeriodoFiscalStatus, ResumenPrecierre } from '@/types/api';

import { useCerrarPeriodo } from '../hooks/use-cerrar-periodo';
import { useResumenPrecierre } from '../hooks/use-resumen-precierre';

import { ReabrirPeriodoDialog } from './reabrir-periodo-dialog';

interface PeriodoDetailDrawerProps {
  periodoId: string | null;
  /** Reservado para uso futuro (CerrarGestionButton en el page). No se consume en el drawer. */
  gestionId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Estado del período seleccionado (`null` cuando el drawer está cerrado). */
  periodoStatus: PeriodoFiscalStatus | null;
  /** Si el período fue marcado definitivo (no reabrible). */
  periodoEsDefinitivo: boolean;
}

const NOMBRE_MES: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
};

export function PeriodoDetailDrawer(
  props: PeriodoDetailDrawerProps,
): React.JSX.Element {
  const { periodoId, onOpenChange, periodoStatus, periodoEsDefinitivo } = props;
  // props.gestionId reservado para CerrarGestionButton en el page — no se usa en el drawer.
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const puedeReabrir = usePuedeReabrir();
  const cerrarPeriodo = useCerrarPeriodo();

  const { data: resumen, isLoading, isError } = useResumenPrecierre(
    periodoId ?? undefined,
  );

  const isOpen = periodoId !== null;

  function handleCerrarPeriodo(): void {
    if (periodoId === null) return;
    cerrarPeriodo.mutate(periodoId, {
      onSuccess: () => {
        toast.success('Período cerrado correctamente');
      },
      onError: (err) => {
        toast.error(mensajePeriodosFiscales(err));
      },
    });
  }

  const nombrePeriodo =
    resumen !== undefined
      ? `${NOMBRE_MES[resumen.periodo.month] ?? resumen.periodo.month} ${resumen.periodo.year}`
      : '';

  // El botón "Reabrir" espeja al backend (PeriodosFiscalesService.reabrir): se
  // muestra solo si el usuario es OWNER/ADMIN y el PERÍODO está CERRADO y no es
  // definitivo. NO depende del estado de la gestión: un período cerrado dentro de
  // una gestión abierta es reabrible (corrección de un mes cerrado de más).
  const mostrarReabrir =
    puedeReabrir && periodoStatus === 'CERRADO' && !periodoEsDefinitivo;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          // Full-screen en mobile, ancho fijo en desktop.
          className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
        >
          <SheetHeader>
            <SheetTitle>
              {resumen !== undefined
                ? `Período ${resumen.periodo.ordenEnGestion} — ${nombrePeriodo}`
                : 'Detalle del período'}
            </SheetTitle>
            <SheetDescription>
              Resumen de comprobantes y estado pre-cierre.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 py-2 space-y-6">
            {isLoading ? <DrawerSkeleton /> : null}
            {isError ? (
              <p className="text-sm text-destructive">
                No se pudo cargar el resumen del período.
              </p>
            ) : null}
            {resumen !== undefined ? <DrawerBody resumen={resumen} /> : null}
          </div>

          <SheetFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              {mostrarReabrir ? (
                <Button
                  variant="outline"
                  onClick={() => setReabrirOpen(true)}
                >
                  Reabrir período
                </Button>
              ) : null}
              <PermissionButton
                permission={PERMISSIONS.contabilidad.periodos.cerrar}
                deniedReason="No tenés permiso para cerrar períodos"
                disabled={resumen === undefined || !resumen.puedeCerrar || cerrarPeriodo.isPending}
                onClick={handleCerrarPeriodo}
              >
                {cerrarPeriodo.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cerrando…
                  </>
                ) : (
                  'Cerrar período'
                )}
              </PermissionButton>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ReabrirPeriodoDialog
        open={reabrirOpen}
        onOpenChange={setReabrirOpen}
        periodoId={periodoId}
        nombrePeriodo={nombrePeriodo}
      />
    </>
  );
}

function DrawerSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

interface DrawerBodyProps {
  resumen: ResumenPrecierre;
}

function DrawerBody({ resumen }: DrawerBodyProps): React.JSX.Element {
  const { comprobantes, totalesBob, borradoresPendientes, razonNoPuedeCerrar } = resumen;

  return (
    <div className="space-y-6">
      {/* Sección 1: contadores */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Comprobantes
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <CounterCard label="Contabilizados" value={comprobantes.contabilizados} />
          <CounterCard label="Borradores" value={comprobantes.borradores} highlight={comprobantes.borradores > 0} />
          <CounterCard label="Anulados" value={comprobantes.anulados} />
        </div>
      </section>

      {/* Sección 2: totales BOB */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Totales BOB
        </h3>
        <div className="rounded-md border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Debe</span>
            <span className="font-mono tabular-nums">Bs {totalesBob.totalDebe}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Haber</span>
            <span className="font-mono tabular-nums">Bs {totalesBob.totalHaber}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t">
            <span className="text-sm text-muted-foreground">Balance</span>
            <Badge
              variant="outline"
              className={cn(
                'font-normal text-xs',
                totalesBob.balanceado
                  ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900'
                  : 'text-destructive bg-destructive/10 border-destructive/30',
              )}
            >
              {totalesBob.balanceado ? 'Balanceado' : 'No balanceado'}
            </Badge>
          </div>
        </div>
      </section>

      {/* Sección 3: borradores pendientes (solo si existen) */}
      {borradoresPendientes.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Borradores pendientes
          </h3>
          <ul className="space-y-2">
            {borradoresPendientes.map((b) => (
              <BorradorItem key={b.id} borrador={b} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Sección 4: razón no puede cerrar */}
      {razonNoPuedeCerrar !== undefined ? (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3">
          <p className="text-sm text-destructive">{razonNoPuedeCerrar}</p>
        </div>
      ) : null}
    </div>
  );
}

interface CounterCardProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function CounterCard({ label, value, highlight = false }: CounterCardProps): React.JSX.Element {
  return (
    <div className="rounded-md border bg-card p-3 text-center">
      <p
        className={cn(
          'text-2xl font-bold tabular-nums',
          highlight && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

interface BorradorItemProps {
  borrador: BorradorPendiente;
}

function BorradorItem({ borrador }: BorradorItemProps): React.JSX.Element {
  return (
    <li className="flex items-start justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium truncate">{borrador.glosa}</p>
        <p className="text-xs text-muted-foreground">{borrador.fechaContable}</p>
      </div>
      <span className="font-mono text-xs tabular-nums shrink-0">
        Bs {borrador.total}
      </span>
    </li>
  );
}
