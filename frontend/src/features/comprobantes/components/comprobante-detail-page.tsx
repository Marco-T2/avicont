import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
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
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

import { formatearFechaContable } from '../lib/formatear-fecha-contable';
import {
  prefijoDe,
  secuenciaDe,
} from '../lib/formatear-numero-correlativo';
import { useComprobante } from '../hooks/use-comprobante';

import { AnularComprobanteSheet } from './anular-comprobante-sheet';
import { AuditoriaSheet } from './auditoria-sheet';
import { ComprobanteActionsBar } from './comprobante-actions-bar';
import { ContabilizarComprobanteDialog } from './contabilizar-comprobante-dialog';
import { EliminarComprobanteDialog } from './eliminar-comprobante-dialog';
import { EstadoComprobanteBadge } from './estado-comprobante-badge';
import { MontoCell } from './monto-cell';

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
    <div className="space-y-4 p-4 md:p-6">
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

  // Cross-feature: cuentas para mostrar nombre·código en la tabla de líneas read-only.
  const { data: cuentasData } = useCuentas({
    esDetalle: true,
    activa: true,
    pageSize: 200,
  });
  const cuentas = cuentasData?.items ?? [];
  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));

  if (isLoading) return <PageSkeleton />;

  if (isError || comprobante === undefined) {
    return (
      <div className="p-4 md:p-6 space-y-4">
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
      <div className="p-4 md:p-6 space-y-5">
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
              <p className="font-medium mt-0.5">{comprobante.monedaPrincipal}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Debe BOB</p>
              <MontoCell
                monto={comprobante.totalDebitoBob}
                moneda={comprobante.monedaPrincipal}
                className="font-medium mt-0.5 block"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Haber BOB</p>
              <MontoCell
                monto={comprobante.totalCreditoBob}
                moneda={comprobante.monedaPrincipal}
                className="font-medium mt-0.5 block"
              />
            </div>
          </div>

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
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 text-center">#</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">T.C.</TableHead>
                  <TableHead className="text-right">Debe BOB</TableHead>
                  <TableHead className="text-right">Haber BOB</TableHead>
                  <TableHead>Glosa línea</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comprobante.lineas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
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
                            // Fallback: cuenta inactiva o fuera del pageSize=200 → mostrar UUID.
                            return <span className="font-mono text-muted-foreground">{linea.cuentaId}</span>;
                          }
                          return (
                            <span>
                              <span className="font-mono text-xs">{cuenta.codigoInterno}</span>
                              <span className="text-muted-foreground"> · </span>
                              <span>{cuenta.nombre}</span>
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs">{linea.moneda}</TableCell>
                      <TableCell className="text-right">
                        <MontoCell monto={linea.debito} moneda={linea.moneda} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MontoCell monto={linea.credito} moneda={linea.moneda} />
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">
                        {linea.tipoCambio}
                      </TableCell>
                      <TableCell className="text-right">
                        <MontoCell monto={linea.debitoBob} moneda="BOB" />
                      </TableCell>
                      <TableCell className="text-right">
                        <MontoCell monto={linea.creditoBob} moneda="BOB" />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {linea.glosaLinea ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Sheets y dialogs controlados por estado local */}
      <ContabilizarComprobanteDialog
        open={contabilizarOpen}
        onOpenChange={setContabilizarOpen}
        comprobanteId={comprobante.id}
        glosa={comprobante.glosa}
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
