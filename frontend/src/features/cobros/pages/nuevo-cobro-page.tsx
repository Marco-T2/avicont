import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2, ChevronLeft, Circle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PERMISSIONS } from '@/lib/permissions';

// Cross-feature: el "hoy" contable en America/La_Paz (§4.6 — nunca UTC).
import { hoyEnLaPaz } from '@/features/comprobantes/lib/hoy-en-la-paz';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
// Cross-feature: el estado de cuenta publica las ventas abiertas EN ORDEN
// CANÓNICO FIFO (REQ-CXC-05) — esta pantalla auto-tilda sobre ese orden, no
// lo recalcula. Hook creado por la feature estado-cuenta; acá solo se consume.
import { useEstadoCuenta } from '@/features/estado-cuenta/hooks/use-estado-cuenta';
// Cross-feature: cuentas de detalle activas para la PRECARGA de Caja General
// (1.1.1.001). Mismos params que CuentaAutocomplete → misma queryKey → cero
// requests extra. La precarga es UI, no concepto de backend (D-05): si no
// existe, el usuario elige y listo.
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';

import { CobroCabeceraFields } from '../components/cobro-cabecera-fields';
import { VentasAbiertasFifo } from '../components/ventas-abiertas-fifo';
import {
  useGuardarCobroConAplicaciones,
  type ModoGuardar,
  type PasoGuardar,
} from '../hooks/use-guardar-cobro-con-aplicaciones';
import {
  autoTildeFifo,
  resumenReparto,
  sugerirMontoParaFila,
  type FilaAplicacion,
} from '../lib/auto-tilde-fifo';
import { aCentavosSeguro } from '../lib/dinero-centavos';
import { cobroFormSchema, type CobroFormValues } from '../schemas/cobro-form-schema';

const CODIGO_CAJA_GENERAL = '1.1.1.001';

/**
 * Alta de cobro estilo Receive Payment (REQ-CXC-05): elegir cliente → se
 * listan sus ventas abiertas → escribir el monto → auto-tilde FIFO de la más
 * vieja hacia adelante, SIEMPRE destildable y con monto editable por fila.
 * Cero confirmaciones al guardar (D-14).
 */
export function NuevoCobroPage(): React.JSX.Element {
  // La precarga de Caja General necesita las cuentas ANTES de montar el form
  // (defaultValues se evalúa una sola vez). Skeleton hasta que llegue.
  const { data: cuentasData, isLoading } = useCuentas({
    esDetalle: true,
    activa: true,
    pageSize: 100,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const cajaGeneralId =
    cuentasData?.items.find((c) => c.codigoInterno === CODIGO_CAJA_GENERAL)?.id ?? '';

  return <NuevoCobroForm cajaGeneralId={cajaGeneralId} />;
}

function NuevoCobroForm({ cajaGeneralId }: { cajaGeneralId: string }): React.JSX.Element {
  const navigate = useNavigate();
  const { guardar, progreso, isPending } = useGuardarCobroConAplicaciones();

  const form = useForm<CobroFormValues>({
    resolver: zodResolver(cobroFormSchema),
    defaultValues: {
      contactoId: '',
      fechaContable: hoyEnLaPaz(),
      monto: '',
      cuentaDestinoId: cajaGeneralId,
      glosa: '',
    },
  });
  const { control, handleSubmit } = form;

  const contactoId = useWatch({ control, name: 'contactoId' });
  const monto = useWatch({ control, name: 'monto' });

  const estadoCuenta = useEstadoCuenta(contactoId !== '' ? contactoId : undefined);
  const ventas = estadoCuenta.data?.ventas ?? [];

  // Overrides del usuario sobre la sugerencia. null = "seguir la sugerencia":
  // las filas se DERIVAN durante el render (Anti-F-02, sin useEffect) y
  // cambiar el monto o el cliente vuelve a la sugerencia limpia.
  const [overrides, setOverrides] = useState<FilaAplicacion[] | null>(null);

  const filas = overrides ?? autoTildeFifo(ventas, monto);
  const resumen = resumenReparto(monto, filas);

  function handleToggle(ventaId: string): void {
    const venta = ventas.find((v) => v.ventaId === ventaId);
    setOverrides(
      filas.map((fila) => {
        if (fila.ventaId !== ventaId) return fila;
        if (fila.tildada) return { ...fila, tildada: false, montoAplicado: '' };
        return {
          ...fila,
          tildada: true,
          montoAplicado: sugerirMontoParaFila(
            monto,
            filas,
            venta?.saldoPendiente ?? '0',
          ),
        };
      }),
    );
  }

  function handleMontoFilaChange(ventaId: string, nuevoMonto: string): void {
    setOverrides(
      filas.map((fila) =>
        fila.ventaId === ventaId ? { ...fila, montoAplicado: nuevoMonto } : fila,
      ),
    );
  }

  const filasTildadas = filas.filter(
    (f) => f.tildada && (aCentavosSeguro(f.montoAplicado) ?? 0n) > 0n,
  );

  // "Guardar y contabilizar" son TRES llamadas con TRES permisos distintos:
  // POST /cobros (`create`) → /contabilizar (`post`) → /aplicaciones × N
  // (`update`, igual que en la pantalla de edición). El gate los pide todos,
  // porque un botón que se rompe en el paso 3 deja el peor estado posible: el
  // cobro YA contabilizado y sin aplicaciones, o sea el importe entero como
  // saldo a favor y la deuda del cliente intacta.
  //
  // `update` entra SOLO si hay algo que aplicar: sin filas tildadas el cobro
  // es un anticipo puro y no dispara ninguna llamada que lo exija — pedirlo
  // igual le bloquearía al usuario una operación que el backend le acepta.
  const requiereUpdate = filasTildadas.length > 0;
  const permisosContabilizar = [
    PERMISSIONS.contabilidad.cobros.create,
    PERMISSIONS.contabilidad.cobros.post,
    ...(requiereUpdate ? [PERMISSIONS.contabilidad.cobros.update] : []),
  ];

  async function doGuardar(values: CobroFormValues, modo: ModoGuardar): Promise<void> {
    const ventaPorId = new Map(ventas.map((v) => [v.ventaId, v]));
    // Las aplicaciones viajan EXPLÍCITAS: una por fila tildada con monto > 0.
    // En modo borrador el hook las descarta (el backend exige ambas puntas
    // contabilizadas y el cobro nace BORRADOR — rechazo garantizado).
    const aplicaciones = filasTildadas.map((f) => {
      const venta = ventaPorId.get(f.ventaId);
      return {
        ventaId: f.ventaId,
        montoAplicado: f.montoAplicado,
        etiqueta:
          venta !== undefined
            ? `Venta del ${formatearFechaContable(venta.fechaContable)}`
            : `Venta ${f.ventaId}`,
      };
    });

    const resultado = await guardar(
      {
        contactoId: values.contactoId,
        fechaContable: values.fechaContable,
        monto: values.monto,
        cuentaDestinoId: values.cuentaDestinoId,
        glosa: values.glosa.trim(),
      },
      aplicaciones,
      modo,
    );

    if (resultado.ok) {
      toast.success(
        modo === 'contabilizar'
          ? 'Cobro registrado y contabilizado'
          : 'Borrador de cobro guardado',
      );
      void navigate(`/cobros/${resultado.cobroId}/editar`, { replace: true });
      return;
    }

    // El fallo se comunica DICIENDO DÓNDE quedó el flujo — nunca fingir que
    // no pasó nada. Con cobro creado se continúa desde la edición.
    switch (resultado.falloEn) {
      case 'cobro':
        toast.error(resultado.error);
        return;
      case 'contabilizar':
        toast.error(
          `El cobro quedó guardado como BORRADOR, pero no se pudo contabilizar: ${resultado.error} Continuá desde la pantalla de edición.`,
        );
        break;
      case 'aplicacion':
        toast.error(
          `El cobro quedó registrado y contabilizado, pero falló una aplicación: ${resultado.error} Continuá desde la pantalla de edición.`,
        );
        break;
    }
    if (resultado.cobroId !== null) {
      void navigate(`/cobros/${resultado.cobroId}/editar`, { replace: true });
    }
  }

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void navigate('/cobros')}
        className="gap-1 -ml-2"
      >
        <ChevronLeft className="h-4 w-4" />
        Cobros
      </Button>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Nuevo cobro</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Registrá el pago del cliente y aplicalo a sus ventas pendientes.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          void handleSubmit((values) => doGuardar(values, 'contabilizar'))(e);
        }}
        className="space-y-6"
        noValidate
      >
        <CobroCabeceraFields
          form={form}
          disabled={isPending}
          onContactoSelect={() => setOverrides(null)}
          onMontoInput={() => setOverrides(null)}
        />

        {contactoId !== '' && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Ventas abiertas del cliente
            </h2>

            {estadoCuenta.isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : estadoCuenta.isError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                No se pudo cargar el estado de cuenta del cliente.
              </div>
            ) : ventas.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
                <p className="text-sm text-muted-foreground">
                  El cliente no tiene ventas abiertas: el cobro completo quedará
                  como saldo a favor (anticipo).
                </p>
              </div>
            ) : (
              <>
                <VentasAbiertasFifo
                  ventas={ventas}
                  filas={filas}
                  onToggle={handleToggle}
                  onMontoChange={handleMontoFilaChange}
                  disabled={isPending}
                />
                <ResumenRepartoBar
                  totalAplicado={resumen.totalAplicado}
                  sinAplicar={resumen.sinAplicar}
                  excedeMonto={resumen.excedeMonto}
                />
              </>
            )}
          </section>
        )}

        {(isPending || progreso.some((p) => p.estado === 'error')) && (
          <ProgresoGuardado pasos={progreso} />
        )}

        <div className="space-y-2">
          {/* El usuario se entera ANTES de tocar el botón: las aplicaciones
              solo existen con el cobro contabilizado (REQ-CXC-03). */}
          <p className="text-xs text-muted-foreground">
            Las aplicaciones a ventas se registran al contabilizar el cobro.
            {filasTildadas.length > 0 && (
              <>
                {' '}
                «Guardar borrador» crea el cobro <strong>sin aplicar</strong>:{' '}
                {filasTildadas.length === 1
                  ? 'la venta tildada quedará'
                  : `las ${filasTildadas.length} ventas tildadas quedarán`}{' '}
                pendientes hasta que lo contabilices.
              </>
            )}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void navigate('/cobros')}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <PermissionButton
              permission={PERMISSIONS.contabilidad.cobros.create}
              deniedReason="No tenés permiso para registrar cobros"
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                void handleSubmit((values) => doGuardar(values, 'borrador'))();
              }}
              className="w-full sm:w-auto"
            >
              Guardar borrador
            </PermissionButton>
            <PermissionButton
              permission={permisosContabilizar}
              deniedReason={
                requiereUpdate
                  ? 'No tenés permiso para registrar, contabilizar y aplicar cobros a ventas'
                  : 'No tenés permiso para registrar y contabilizar cobros'
              }
              type="submit"
              disabled={isPending || resumen.excedeMonto}
              className="w-full sm:w-auto"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar y contabilizar'
              )}
            </PermissionButton>
          </div>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------
// Totales del reparto (§4.5: derivados en centavos, mostrados como string).
// ------------------------------------------------------------

function ResumenRepartoBar({
  totalAplicado,
  sinAplicar,
  excedeMonto,
}: {
  totalAplicado: string;
  sinAplicar: string;
  excedeMonto: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span>
        Aplicado a ventas:{' '}
        <span className="font-mono tabular-nums font-medium">Bs {totalAplicado}</span>
      </span>
      {excedeMonto ? (
        <span className="text-destructive font-medium" role="alert">
          Lo aplicado supera el monto del cobro: ajustá los montos por fila.
        </span>
      ) : (
        <span>
          Sin aplicar (saldo a favor):{' '}
          <span className="font-mono tabular-nums font-medium">Bs {sinAplicar}</span>
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Progreso de la orquestación multi-request (cobro + N aplicaciones).
// ------------------------------------------------------------

function ProgresoGuardado({ pasos }: { pasos: PasoGuardar[] }): React.JSX.Element {
  return (
    <div className="rounded-md border bg-card px-4 py-3 space-y-2">
      {pasos.map((paso) => (
        <div key={paso.id} className="flex items-start gap-2 text-sm">
          {paso.estado === 'listo' ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
          ) : paso.estado === 'error' ? (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          ) : paso.estado === 'guardando' ? (
            <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />
          ) : (
            <Circle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <span>{paso.etiqueta}</span>
            {paso.error !== undefined && (
              <p className="text-destructive text-xs mt-0.5">{paso.error}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
