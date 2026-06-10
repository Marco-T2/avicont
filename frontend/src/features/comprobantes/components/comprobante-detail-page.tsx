import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useContactos } from '@/features/contactos/hooks/use-contactos';
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

import { formatearFechaContable } from '../lib/formatear-fecha-contable';
import {
  prefijoDe,
  secuenciaDe,
} from '../lib/formatear-numero-correlativo';
import { useComprobante } from '../hooks/use-comprobante';

import { usePuedeEditarContabilizado } from '../hooks/use-puede-editar-contabilizado';
import { AnularComprobanteSheet } from './anular-comprobante-sheet';
import { AuditoriaSheet } from './auditoria-sheet';
import { ComprobanteActionsBar } from './comprobante-actions-bar';
import { ContabilizarComprobanteDialog } from './contabilizar-comprobante-dialog';
import { EliminarComprobanteDialog } from './eliminar-comprobante-dialog';
import { EstadoComprobanteBadge } from './estado-comprobante-badge';
import { MontoCell } from './monto-cell';
import { AdjuntosSection } from './adjuntos-section';
import { DocumentosRespaldoSection } from './documentos-respaldo-section';

const TIPO_LABELS: Record<string, string> = {
  DIARIO: 'Diario',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
  TRASPASO: 'Traspaso',
  AJUSTE: 'Ajuste',
  APERTURA: 'Apertura',
  CIERRE: 'Cierre',
};

function CorrelativoDisplay({
  numero,
}: {
  numero: string | null;
}): React.JSX.Element {
  if (numero === null || numero === '') {
    return <span className="font-mono text-muted-foreground">—</span>;
  }
  const prefijo = prefijoDe(numero);
  const secuencia = secuenciaDe(numero);
  return (
    <span className="font-mono text-sm font-semibold">
      {prefijo}
      {secuencia !== null && (
        <span className="text-muted-foreground font-normal">-{secuencia}</span>
      )}
    </span>
  );
}

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
 * Página de detalle de un comprobante (/comprobantes/:id).
 *
 * Carga el comprobante via useComprobante(id). Si no existe, muestra 404.
 *
 * Secciones:
 * - Cabecera: tipo, número correlativo, estado, fecha, glosa, moneda, totales.
 * - Tabla de líneas read-only (NO usa LineasEditor — render manual con MontoCell).
 * - ComprobanteActionsBar — "Editar" navega a /comprobantes/:id/editar.
 * - Banner rojo si anulado=true con info de anulación.
 *
 * Sheets/dialogs controlados localmente (cómodos en modal pequeño):
 * - ContabilizarComprobanteDialog
 * - AnularComprobanteSheet
 * - EliminarComprobanteDialog
 * - AuditoriaSheet
 *
 * Edición (form multi-línea, incómodo en Sheet): navega a /comprobantes/:id/editar.
 */
export function ComprobanteDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [contabilizarOpen, setContabilizarOpen] = useState(false);
  const [anularOpen, setAnularOpen] = useState(false);
  const [eliminarOpen, setEliminarOpen] = useState(false);
  const [auditoriaId, setAuditoriaId] = useState<string | null>(null);

  const { data: comprobante, isLoading, isError } = useComprobante(id ?? '');
  const puedeEditarContabilizado = usePuedeEditarContabilizado();

  // Cross-feature: cuentas para mostrar nombre·código en la tabla de líneas read-only.
  // pageSize 100 = límite del backend (ListarCuentasQueryDto @Max(100)). Si un tenant
  // supera 100 cuentas de detalle, migrar a server-side search.
  const { data: cuentasData } = useCuentas({
    esDetalle: true,
    activa: true,
    pageSize: 100,
  });
  const cuentas = cuentasData?.items ?? [];
  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));

  // Cross-feature: contactos para mostrar razonSocial en la columna Contacto read-only.
  // pageSize 50 = misma convención conservadora que linea-row. Si un tenant supera ese
  // cap, el fallback muestra el UUID (riesgo conocido y aceptado, igual que cuentas).
  const { data: contactosData, isLoading: isLoadingContactos } = useContactos({
    activo: true,
    pageSize: 50,
  });
  const contactos = contactosData?.items ?? [];
  const contactoPorId = new Map(contactos.map((c) => [c.id, c.razonSocial]));

  // Líneas que requieren contacto y no tienen uno asignado — se pasan al dialog
  // de contabilizar para mostrar el aviso blando (REQ-CCL-UI-02).
  // useMemo (no useEffect) — Anti-F-02.
  const lineasSinContacto = useMemo(
    () =>
      (comprobante?.lineas ?? [])
        .filter((l) => {
          const cuenta = cuentaPorId.get(l.cuentaId);
          return cuenta?.requiereContacto === true && !l.contactoId;
        })
        .map((l) => l.orden),
    // cuentaPorId se recrea en cada render — incluyendo cuentas como dep directa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comprobante?.lineas, cuentas],
  );

  if (isLoading) return <PageSkeleton />;

  if (isError || comprobante === undefined) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          Comprobante no encontrado o no tenés acceso.
        </p>
        <Button
          variant="outline"
          onClick={() => void navigate('/comprobantes')}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver a comprobantes
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Breadcrumb/back */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate('/comprobantes')}
          className="gap-1 -ml-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Comprobantes
        </Button>

        {/* Banner anulado */}
        {comprobante.anulado && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <div className="text-sm text-destructive space-y-0.5">
              <p className="font-semibold">Comprobante anulado</p>
              {comprobante.fechaAnulacion !== null && (
                <p className="text-xs">
                  Fecha:{' '}
                  {formatearFechaContable(
                    comprobante.fechaAnulacion.slice(0, 10),
                  )}
                </p>
              )}
              {comprobante.motivoAnulacion !== null && (
                <p className="text-xs">
                  Motivo:{' '}
                  <span className="italic">"{comprobante.motivoAnulacion}"</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cabecera */}
        <div className="rounded-md border bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-normal">
                  {TIPO_LABELS[comprobante.tipo] ?? comprobante.tipo}
                </Badge>
                <EstadoComprobanteBadge
                  estado={comprobante.estado}
                  anulado={comprobante.anulado}
                />
              </div>
              <CorrelativoDisplay numero={comprobante.numero} />
            </div>
            <ComprobanteActionsBar
              comprobante={comprobante}
              onEdit={() => void navigate(`/comprobantes/${comprobante.id}/editar`)}
              onContabilizar={() => setContabilizarOpen(true)}
              onAnular={() => setAnularOpen(true)}
              onEliminar={() => setEliminarOpen(true)}
              onVerAuditoria={() => setAuditoriaId(comprobante.id)}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Fecha contable</p>
              <p className="font-medium mt-0.5">
                {formatearFechaContable(comprobante.fechaContable)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Moneda</p>
              {/* monedaPrincipal lockada a BOB; se muestra "BOB" fijo. */}
              <p className="font-medium mt-0.5">BOB</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Debe BOB</p>
              {/* totalDebitoBob SIEMPRE es BOB. */}
              <MontoCell
                monto={comprobante.totalDebitoBob}
                moneda="BOB"
                className="font-medium mt-0.5 block"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Haber BOB</p>
              {/* totalCreditoBob SIEMPRE es BOB. */}
              <MontoCell
                monto={comprobante.totalCreditoBob}
                moneda="BOB"
                className="font-medium mt-0.5 block"
              />
            </div>
          </div>

          {/* T/C re-expresión — solo visible cuando ≠ 1 (es solo presentación). */}
          {comprobante.tipoCambioReexpresion !== '1' &&
            comprobante.tipoCambioReexpresion !== '1.00000000' && (
              <div>
                <p className="text-xs text-muted-foreground">T/C re-expresión</p>
                <p className="text-sm font-mono mt-0.5">{comprobante.tipoCambioReexpresion}</p>
              </div>
            )}

          <div>
            <p className="text-xs text-muted-foreground">Glosa</p>
            <p className="text-sm mt-0.5">{comprobante.glosa}</p>
          </div>
        </div>

        {/* Líneas read-only */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Líneas
          </h2>
          {/* table-fixed + colgroup: anchos predecibles e independientes del
              contenido (un nombre de cuenta largo se trunca, no desbalancea la
              fila). Mismo criterio que el editor (lineas-editor.tsx). min-w-[800px]
              = piso: por debajo scrollea en vez de aplastar (CLAUDE.md §7).
              Columnas de multimoneda (Moneda, T.C., Debe/Haber nativos) ocultas:
              la UI lockea BOB; Debe/Haber muestran el monto en BOB (debitoBob). */}
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[800px] table-fixed">
              <colgroup>
                <col className="w-[44px]" /> {/* # orden */}
                <col className="w-[24%]" /> {/* Cuenta */}
                <col className="w-[13%]" /> {/* Debe */}
                <col className="w-[13%]" /> {/* Haber */}
                <col className="w-[34%]" /> {/* Glosa línea */}
                <col className="w-[16%]" /> {/* Contacto */}
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">#</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead>Glosa línea</TableHead>
                  <TableHead>Contacto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comprobante.lineas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      Sin líneas
                    </TableCell>
                  </TableRow>
                ) : (
                  comprobante.lineas.map((linea) => (
                    <TableRow key={linea.id}>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {linea.orden}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const cuenta = cuentaPorId.get(linea.cuentaId);
                          if (cuenta === undefined) {
                            // Fallback: cuenta inactiva o fuera del pageSize=100 → mostrar UUID.
                            return (
                              <span className="block truncate font-mono text-muted-foreground" title={linea.cuentaId}>
                                {linea.cuentaId}
                              </span>
                            );
                          }
                          return (
                            <span
                              className="block truncate"
                              title={`${cuenta.codigoInterno} · ${cuenta.nombre}`}
                            >
                              <span className="font-mono text-xs">{cuenta.codigoInterno}</span>
                              <span className="text-muted-foreground"> · </span>
                              <span>{cuenta.nombre}</span>
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <MontoCell monto={linea.debitoBob} moneda="BOB" />
                      </TableCell>
                      <TableCell className="text-right">
                        <MontoCell monto={linea.creditoBob} moneda="BOB" />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="block truncate" title={linea.glosaLinea ?? undefined}>
                          {linea.glosaLinea ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          if (linea.contactoId === null || linea.contactoId === undefined) {
                            return <span className="text-muted-foreground">—</span>;
                          }
                          if (isLoadingContactos) {
                            return <Skeleton className="h-4 w-24" />;
                          }
                          const razonSocial = contactoPorId.get(linea.contactoId);
                          if (razonSocial === undefined) {
                            // Fallback: contacto fuera del pageSize=50 → mostrar UUID.
                            return (
                              <span className="block truncate font-mono text-muted-foreground" title={linea.contactoId}>
                                {linea.contactoId}
                              </span>
                            );
                          }
                          return (
                            <span className="block truncate" title={razonSocial}>
                              {razonSocial}
                            </span>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Documentos de respaldo y adjuntos — D5: editable solo si no anulado y estado permite */}
        {(() => {
          const editableEnDetail =
            !comprobante.anulado &&
            (comprobante.estado === 'BORRADOR' ||
              (comprobante.estado === 'CONTABILIZADO' && puedeEditarContabilizado));
          return (
            <>
              <DocumentosRespaldoSection
                comprobante={comprobante}
                editable={editableEnDetail}
              />
              <AdjuntosSection
                comprobante={comprobante}
                editable={editableEnDetail}
              />
            </>
          );
        })()}
      </div>

      {/* Sheets y dialogs controlados por estado local */}
      <ContabilizarComprobanteDialog
        open={contabilizarOpen}
        onOpenChange={setContabilizarOpen}
        comprobanteId={comprobante.id}
        glosa={comprobante.glosa}
        lineasSinContacto={lineasSinContacto}
      />

      <AnularComprobanteSheet
        open={anularOpen}
        onOpenChange={setAnularOpen}
        comprobanteId={comprobante.id}
        glosa={comprobante.glosa}
      />

      <EliminarComprobanteDialog
        open={eliminarOpen}
        onOpenChange={setEliminarOpen}
        comprobanteId={comprobante.id}
        glosa={comprobante.glosa}
      />

      <AuditoriaSheet
        comprobanteId={auditoriaId}
        onOpenChange={(open) => {
          if (!open) setAuditoriaId(null);
        }}
      />
    </>
  );
}
