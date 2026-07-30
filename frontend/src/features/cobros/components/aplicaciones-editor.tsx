import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PERMISSIONS } from '@/lib/permissions';
import type { AplicacionCobro, Cobro, VentaEstadoCuenta } from '@/types/api';

// Cross-feature: presentación compartida con el núcleo de comprobantes.
import { MontoCell } from '@/features/comprobantes/components/monto-cell';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
// Cross-feature: detalle de la venta POR ID para la etiqueta de cada
// aplicación. El estado de cuenta solo publica ventas con saldo > 0, así que
// una venta SALDADA (el caso más común tras aplicar el pago completo)
// desaparece de ahí y sin este lookup la fila mostraba el UUID crudo.
// Se resuelve por id — NO con useVentas({contactoId, pageSize}) — porque el
// listado pagina con tope 100 (ListarVentasDto @Max) y con más ventas que el
// tope el UUID volvería; el detalle por id no pagina y TanStack lo cachea
// por ventaId, así que N filas = N queries chicas dedupeadas.
import { useVenta } from '@/features/ventas/hooks/use-venta';

import { useCrearAplicacion, useEditarAplicacion, useEliminarAplicacion } from '../hooks/use-aplicacion-mutations';
import { aCentavos, aCentavosSeguro, deCentavos } from '../lib/dinero-centavos';

interface AplicacionesEditorProps {
  cobro: Cobro;
  /**
   * Ventas abiertas del cliente (estado de cuenta, orden FIFO del backend).
   * undefined mientras carga.
   */
  ventasAbiertas: VentaEstadoCuenta[] | undefined;
  /** true cuando el cobro está anulado: todo read-only. */
  disabled: boolean;
}

/**
 * Gestión de aplicaciones en la edición del cobro (REQ-CXC-03): vínculos
 * editables que NO generan asiento. Aplicar y desaplicar van SIN confirmación
 * (D-14) y quedan bajo `cobros.update` (mutan el vínculo, no crean hecho
 * contable) — por eso también proceden sobre cobros de períodos cerrados.
 */
export function AplicacionesEditor({
  cobro,
  ventasAbiertas,
  disabled,
}: AplicacionesEditorProps): React.JSX.Element {
  const ventaPorId = new Map((ventasAbiertas ?? []).map((v) => [v.ventaId, v]));

  const totalAplicado = cobro.aplicaciones.reduce(
    (acc, a) => acc + (aCentavosSeguro(a.montoAplicado) ?? 0n),
    0n,
  );
  const disponible = aCentavos(cobro.monto) - totalAplicado;

  const ventaIdsAplicadas = new Set(cobro.aplicaciones.map((a) => a.ventaId));
  const ventasAplicables = (ventasAbiertas ?? []).filter(
    (v) => !ventaIdsAplicadas.has(v.ventaId),
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Aplicaciones de este cobro
        </h2>
        {cobro.aplicaciones.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">
              Sin aplicaciones: todo el cobro es saldo a favor del cliente.
            </p>
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-md border">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Venta</TableHead>
                  <TableHead className="text-right w-40">Monto aplicado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cobro.aplicaciones.map((aplicacion) => (
                  <AplicacionRow
                    key={aplicacion.id}
                    cobroId={cobro.id}
                    aplicacion={aplicacion}
                    venta={ventaPorId.get(aplicacion.ventaId)}
                    disabled={disabled}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Sin aplicar (saldo a favor):{' '}
          <span className="font-mono tabular-nums">
            Bs {disponible >= 0n ? deCentavos(disponible) : '0.00'}
          </span>
        </p>
      </section>

      {!disabled && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Aplicar a otra venta abierta
          </h2>
          {/* §14.7 afordancia honesta: en BORRADOR la acción se ve pero está
              deshabilitada CON el motivo visible — el backend exige ambas
              puntas contabilizadas (APLICACION_PUNTA_NO_CONTABILIZADA) y
              ofrecer el botón activo sería prometer un request que falla
              siempre. */}
          {cobro.estado === 'BORRADOR' && (
            <div className="mb-3 rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
              Contabilizá el cobro para poder aplicarlo a ventas: solo se
              aplican cobros contabilizados.
            </div>
          )}
          {ventasAplicables.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
              <p className="text-sm text-muted-foreground">
                El cliente no tiene otras ventas abiertas con saldo.
              </p>
            </div>
          ) : (
            <div className="relative overflow-x-auto rounded-md border">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Venta</TableHead>
                    <TableHead className="text-right">Saldo pendiente</TableHead>
                    <TableHead className="text-right w-40">Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasAplicables.map((venta) => (
                    <VentaAplicableRow
                      key={venta.ventaId}
                      cobroId={cobro.id}
                      venta={venta}
                      cobroEnBorrador={cobro.estado === 'BORRADOR'}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Fila de una aplicación existente: monto editable + quitar.
// ------------------------------------------------------------

interface AplicacionRowProps {
  cobroId: string;
  aplicacion: AplicacionCobro;
  /** Venta del estado de cuenta; undefined si ya no tiene saldo (SALDADA). */
  venta: VentaEstadoCuenta | undefined;
  disabled: boolean;
}

function AplicacionRow({
  cobroId,
  aplicacion,
  venta,
  disabled,
}: AplicacionRowProps): React.JSX.Element {
  const [monto, setMonto] = useState(aplicacion.montoAplicado);
  const editarMutation = useEditarAplicacion(cobroId);
  const eliminarMutation = useEliminarAplicacion(cobroId);

  // Cross-feature (ver header): la etiqueta legible sale del detalle de la
  // venta — el estado de cuenta no trae las SALDADAS ni el número correlativo.
  const { data: ventaDetalle, isLoading: cargandoVenta } = useVenta(aplicacion.ventaId);

  const montoValido = (aCentavosSeguro(monto) ?? 0n) > 0n;
  const cambio = monto !== aplicacion.montoAplicado;
  const pending = editarMutation.isPending || eliminarMutation.isPending;

  // Mientras el detalle llega, la venta del estado de cuenta (si tiene saldo)
  // ya alcanza para la fecha — así la fila no parpadea en skeleton.
  const fechaVenta = ventaDetalle?.fechaContable ?? venta?.fechaContable;

  return (
    <TableRow>
      <TableCell>
        {fechaVenta !== undefined ? (
          <span className="whitespace-nowrap">
            Venta del {formatearFechaContable(fechaVenta)}
            {/* §4.9: el correlativo es la referencia que el contador reconoce. */}
            {typeof ventaDetalle?.numero === 'string' && (
              <span className="font-mono text-xs ml-2 text-muted-foreground">
                {ventaDetalle.numero}
              </span>
            )}
            {venta !== undefined && (
              <span className="ml-2 text-xs text-muted-foreground">
                saldo <MontoCell monto={venta.saldoPendiente} className="text-xs" />
              </span>
            )}
          </span>
        ) : cargandoVenta ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          // Fallback honesto: un UUID de 36 caracteres no es información para
          // el usuario (§4.9) — el id queda en el title para soporte.
          <span
            className="text-sm text-muted-foreground"
            title={`Venta ${aplicacion.ventaId}`}
          >
            Venta no encontrada
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Input
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          disabled={disabled || pending}
          inputMode="decimal"
          className="text-base md:text-sm font-mono text-right"
          aria-label="Monto aplicado"
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <PermissionButton
            permission={PERMISSIONS.contabilidad.cobros.update}
            deniedReason="No tenés permiso para modificar aplicaciones"
            variant="outline"
            size="sm"
            disabled={disabled || pending || !cambio || !montoValido}
            onClick={() =>
              editarMutation.mutate(
                { aplicacionId: aplicacion.id, body: { montoAplicado: monto } },
                { onSuccess: () => setMonto(monto) },
              )
            }
          >
            Guardar
          </PermissionButton>
          {/* Desaplicar NO es hecho contable: sin confirmación (D-14). */}
          <PermissionButton
            permission={PERMISSIONS.contabilidad.cobros.update}
            deniedReason="No tenés permiso para modificar aplicaciones"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={disabled || pending}
            onClick={() => eliminarMutation.mutate(aplicacion.id)}
          >
            Quitar
          </PermissionButton>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ------------------------------------------------------------
// Fila de una venta abierta sin aplicación de este cobro: aplicar.
// ------------------------------------------------------------

interface VentaAplicableRowProps {
  cobroId: string;
  venta: VentaEstadoCuenta;
  /** true mientras el cobro esté en BORRADOR: aplicar fallaría siempre
   * (REQ-CXC-03) — la fila queda visible pero inerte, con el motivo en el
   * banner de la sección. */
  cobroEnBorrador: boolean;
}

function VentaAplicableRow({
  cobroId,
  venta,
  cobroEnBorrador,
}: VentaAplicableRowProps): React.JSX.Element {
  const [monto, setMonto] = useState('');
  const crearMutation = useCrearAplicacion(cobroId);

  const montoValido = (aCentavosSeguro(monto) ?? 0n) > 0n;

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        Venta del {formatearFechaContable(venta.fechaContable)}
      </TableCell>
      <TableCell className="text-right">
        <MontoCell monto={venta.saldoPendiente} />
      </TableCell>
      <TableCell className="text-right">
        <Input
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          disabled={cobroEnBorrador || crearMutation.isPending}
          inputMode="decimal"
          placeholder="0.00"
          className="text-base md:text-sm font-mono text-right"
          aria-label={`Monto a aplicar a la venta del ${formatearFechaContable(venta.fechaContable)}`}
        />
      </TableCell>
      <TableCell className="text-right">
        <PermissionButton
          permission={PERMISSIONS.contabilidad.cobros.update}
          deniedReason="No tenés permiso para modificar aplicaciones"
          variant="outline"
          size="sm"
          title={
            cobroEnBorrador
              ? 'Contabilizá el cobro para poder aplicarlo a ventas'
              : undefined
          }
          disabled={cobroEnBorrador || crearMutation.isPending || !montoValido}
          onClick={() =>
            crearMutation.mutate(
              { ventaId: venta.ventaId, montoAplicado: monto },
              { onSuccess: () => setMonto('') },
            )
          }
        >
          Aplicar
        </PermissionButton>
      </TableCell>
    </TableRow>
  );
}
