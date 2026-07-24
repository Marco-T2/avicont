import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
// Cross-feature: el historial de extractos es un sub-recurso de la cuenta
// bancaria (`/api/cuentas-bancarias/:id/importaciones`), así que el drawer vive
// en esa feature y el workspace lo reusa tal cual (tarea 5.36 / 5.39).
import { ImportacionesDrawer } from '@/features/cuentas-bancarias/components/importaciones-drawer';
import { PERMISSIONS } from '@/lib/permissions';
import { usePermissions } from '@/lib/use-permissions';
import type { SugerenciaConciliacion, WorkspaceConciliacionParams } from '@/types/api';

import { ConciliacionFiltros } from '../components/conciliacion-filtros';
import { LineasPanel } from '../components/lineas-panel';
import { ModoConsultaBanner } from '../components/modo-consulta-banner';
import { MovimientosPanel } from '../components/movimientos-panel';
import { ResumenConciliacionBar } from '../components/resumen-conciliacion';
import { SugerenciasPanel } from '../components/sugerencias-panel';
import { claveLinea } from '../lib/sugerencias';
import {
  useBorrarMatch,
  useCambiarEstadoMovimiento,
  useCrearMatch,
} from '../hooks/use-conciliacion-mutations';
import { useWorkspaceConciliacion } from '../hooks/use-workspace-conciliacion';

interface AnclaLinea {
  comprobanteId: string;
  orden: number;
}

/**
 * Workspace de conciliación bancaria (REQ-CB-10 a REQ-CB-18).
 *
 * Orquesta los dos paneles (extracto ↔ libros), el motor de sugerencias y las
 * tres escrituras del módulo: confirmar match, deshacer match e
 * ignorar/des-ignorar.
 *
 * Todo lo que se pinta como estado sale de `estadoEfectivo` (derivado en cada
 * lectura), NUNCA de la columna persistida `estado` — ver `EstadoMovimientoBadge`.
 */
export function ConciliacionPage(): React.JSX.Element {
  const [params, setParams] = useState<WorkspaceConciliacionParams | null>(null);
  const [movimientoSeleccionadoId, setMovimientoSeleccionadoId] = useState<string | null>(null);
  const [lineaSeleccionada, setLineaSeleccionada] = useState<AnclaLinea | null>(null);
  const [extractosOpen, setExtractosOpen] = useState(false);

  const { data, isLoading, isError, isFetching } = useWorkspaceConciliacion(params);

  const { has } = usePermissions();
  // Fail-closed: sin data de permisos `has()` devuelve false → modo consulta.
  const modoConsulta = !has(PERMISSIONS.contabilidad.conciliacion.conciliar);

  const crearMatch = useCrearMatch();
  const borrarMatch = useBorrarMatch();
  const cambiarEstado = useCambiarEstadoMovimiento();

  // Derivado en render, sin estado espejo (Anti-F-02).
  const accionEnCurso =
    crearMatch.isPending || borrarMatch.isPending || cambiarEstado.isPending;

  function limpiarSeleccion(): void {
    setMovimientoSeleccionadoId(null);
    setLineaSeleccionada(null);
  }

  function handleConfirmarSugerencia(s: SugerenciaConciliacion): void {
    crearMatch.mutate({
      movimientoBancarioId: s.movimientoId,
      comprobanteId: s.comprobanteId,
      orden: s.orden,
      confianzaSugerida: s.confianza,
    });
  }

  function handleConciliarSeleccionados(): void {
    if (movimientoSeleccionadoId === null || lineaSeleccionada === null) return;
    // Sin `confianzaSugerida`: este par lo armó el usuario a mano, no salió del
    // motor de sugerencias.
    crearMatch.mutate({
      movimientoBancarioId: movimientoSeleccionadoId,
      comprobanteId: lineaSeleccionada.comprobanteId,
      orden: lineaSeleccionada.orden,
    });
    limpiarSeleccion();
  }

  const hayFiltros = params !== null;

  return (
    <div className="space-y-6">
      {/* Header canónico (frontend/CLAUDE.md §13.1) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Conciliación bancaria</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Cruzá los movimientos del extracto contra las líneas contables de la cuenta banco.
          </p>
        </div>
        {data !== undefined && (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => setExtractosOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Extractos
          </Button>
        )}
      </div>

      {modoConsulta && <ModoConsultaBanner />}

      <div className="rounded-lg border bg-card p-4">
        <ConciliacionFiltros
          onBuscar={(p) => {
            limpiarSeleccion();
            setParams(p);
          }}
          isFetching={isFetching}
        />
      </div>

      {!hayFiltros && (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">
            Elegí una cuenta bancaria y un rango de fechas, y hacé clic en &ldquo;Consultar&rdquo;.
          </p>
        </div>
      )}

      {/* Anti-F-13: el error de una query se muestra inline, nunca con toast
          (se dispararía en cada re-render mientras isError sea true). */}
      {hayFiltros && isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudo cargar la conciliación. Revisá el rango elegido y volvé a consultar.
          </p>
        </div>
      )}

      {hayFiltros && !isError && data !== undefined && (
        <>
          <ResumenConciliacionBar resumen={data.resumen} />

          <section aria-label="Sugerencias">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Sugerencias
            </h2>
            <SugerenciasPanel
              sugerencias={data.sugerencias}
              movimientos={data.movimientos}
              lineas={data.lineas}
              modoConsulta={modoConsulta}
              accionEnCurso={accionEnCurso}
              onConfirmar={handleConfirmarSugerencia}
            />
          </section>

          {!modoConsulta && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Elegí un movimiento y una línea para conciliarlos a mano.
              </p>
              <Button
                size="sm"
                disabled={
                  movimientoSeleccionadoId === null ||
                  lineaSeleccionada === null ||
                  accionEnCurso
                }
                onClick={handleConciliarSeleccionados}
              >
                Conciliar seleccionados
              </Button>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <section aria-label="Movimientos del extracto">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Movimientos del extracto
              </h2>
              <MovimientosPanel
                movimientos={data.movimientos}
                isLoading={isLoading}
                modoConsulta={modoConsulta}
                seleccionadoId={movimientoSeleccionadoId}
                onSeleccionar={setMovimientoSeleccionadoId}
                onDeshacer={(matchId) => borrarMatch.mutate(matchId)}
                onCambiarEstado={(id, estado) => cambiarEstado.mutate({ id, estado })}
                accionEnCurso={accionEnCurso}
              />
            </section>

            <section aria-label="Líneas contables">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Líneas contables
              </h2>
              <LineasPanel
                lineas={data.lineas}
                isLoading={isLoading}
                modoConsulta={modoConsulta}
                seleccionadaClave={
                  lineaSeleccionada !== null
                    ? claveLinea(lineaSeleccionada.comprobanteId, lineaSeleccionada.orden)
                    : null
                }
                onSeleccionar={(comprobanteId, orden) =>
                  setLineaSeleccionada({ comprobanteId, orden })
                }
              />
            </section>
          </div>
        </>
      )}

      <ImportacionesDrawer
        cuentaBancaria={data?.cuentaBancaria ?? null}
        open={extractosOpen}
        onOpenChange={setExtractosOpen}
      />
    </div>
  );
}
