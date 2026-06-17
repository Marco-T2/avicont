import { AlertTriangle } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EstadoComprobante } from '@/types/api';

// Cross-feature: detalle del comprobante de cierre para renderizar sus líneas.
// El GET /api/gestiones/:id/cierre solo trae el esqueleto (id, origenTipo, estado),
// no las líneas. queryKey ['comprobantes','detail',id] → dedupe/cache con el detalle.
import { useComprobante } from '@/features/comprobantes/hooks/use-comprobante';
import { EstadoComprobanteBadge } from '@/features/comprobantes/components/estado-comprobante-badge';
import { MontoCell } from '@/features/comprobantes/components/monto-cell';
import { formatearFechaContable } from '@/features/comprobantes/lib/formatear-fecha-contable';

// Cross-feature: cuentas de detalle activas para resolver nombres en la tabla de líneas.
// pageSize 100 = límite del backend (ListarCuentasQueryDto @Max(100)).
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

// Cross-feature: contactos para mostrar razonSocial en la columna Contacto.
// pageSize 50 = convención conservadora (mismo cap que comprobante-detail-page).
import { useContactos } from '@/features/contactos/hooks/use-contactos';

import { labelOrigenCierre } from '../lib/labels-origen-cierre';

interface AsientoCierreCardProps {
  cierre: {
    id: string;
    origenTipo: string;
    estado: EstadoComprobante;
  };
}

/**
 * Card de preview read-only de UN comprobante de cierre.
 * Muestra cabecera (label del tipo, glosa, badge de estado, totales, fecha)
 * y tabla de líneas (6 columnas).
 * Carga las líneas via useComprobante(cierre.id) — cross-feature, queryKey compartido.
 */
export function AsientoCierreCard({ cierre }: AsientoCierreCardProps): React.JSX.Element {
  // Cross-feature: ver comentario arriba (§14.6).
  const { data: comprobante, isLoading, isError } = useComprobante(cierre.id);

  const { data: cuentasData } = useCuentas({ esDetalle: true, activa: true, pageSize: 100 });
  const cuentas = cuentasData?.items ?? [];
  const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));

  const { data: contactosData, isLoading: isLoadingContactos } = useContactos({
    activo: true,
    pageSize: 50,
  });
  const contactos = contactosData?.items ?? [];
  const contactoPorId = new Map(contactos.map((c) => [c.id, c.razonSocial]));

  return (
    <div className="rounded-md border bg-card space-y-3 pb-4">
      {/* Cabecera del card: siempre visible (viene del GET /cierre) */}
      <div className="px-4 pt-4 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{labelOrigenCierre(cierre.origenTipo)}</h3>
          <EstadoComprobanteBadge estado={cierre.estado} anulado={false} />
        </div>

        {/* Glosa y fecha — disponibles solo si cargó el comprobante */}
        {comprobante !== undefined && (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>{comprobante.glosa}</span>
            <span>{formatearFechaContable(comprobante.fechaContable)}</span>
          </div>
        )}

        {/* Totales */}
        {comprobante !== undefined && (
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground mr-1">Total Debe:</span>
              <MontoCell monto={comprobante.totalDebitoBob} moneda="BOB" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground mr-1">Total Haber:</span>
              <MontoCell monto={comprobante.totalCreditoBob} moneda="BOB" />
            </div>
          </div>
        )}
      </div>

      {/* Body: skeleton / error / tabla */}
      {isLoading && (
        <div className="px-4 space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="mx-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">
            No se pudieron cargar las líneas del asiento de cierre.
          </p>
        </div>
      )}

      {!isLoading && !isError && comprobante !== undefined && (
        <div className="px-4">
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[700px] table-fixed">
              <colgroup>
                <col className="w-[44px]" />
                <col className="w-[24%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
                <col className="w-[34%]" />
                <col className="w-[16%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">#</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Debe (BOB)</TableHead>
                  <TableHead className="text-right">Haber (BOB)</TableHead>
                  <TableHead>Glosa</TableHead>
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
                            return (
                              <span
                                className="block truncate font-mono text-muted-foreground"
                                title={linea.cuentaId}
                              >
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
                            return (
                              <span
                                className="block truncate font-mono text-muted-foreground"
                                title={linea.contactoId}
                              >
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
      )}
    </div>
  );
}
