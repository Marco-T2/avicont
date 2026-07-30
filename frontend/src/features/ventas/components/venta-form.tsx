import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { ContactoCombobox } from '@/components/shared/contacto-combobox';
import { PermissionButton } from '@/components/shared/permission-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
// Cross-feature: badge de estado del comprobante — la venta ES su comprobante
// (REQ-VTA-01) y el flag anulado es ortogonal (§4.7), misma semántica visual.
import { EstadoComprobanteBadge } from '@/features/comprobantes/components/estado-comprobante-badge';
// Cross-feature: CuentaAutocomplete de comprobantes (cuentas de detalle
// activas, pageSize 100 = tope del backend; deuda documentada en el componente).
import { CuentaAutocomplete } from '@/features/comprobantes/components/cuenta-autocomplete';
// Cross-feature: "hoy" contable en America/La_Paz — §4.6, nunca UTC.
import { hoyEnLaPaz } from '@/features/comprobantes/lib/hoy-en-la-paz';
// Cross-feature: cuentas de detalle activas para precargar Caja General
// (1.1.1.001) como cuenta destino del CONTADO (PA-1). pageSize 100 = tope del
// backend; si la cuenta no existe, NO se precarga nada (la spec exige que la
// ausencia del default no rompa el flujo).
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';
import type { CondicionPago, Venta } from '@/types/api';

import { mapearFormAPayload } from '../lib/mapear-form-a-payload';
import { mensajeVentas } from '../lib/mensaje-ventas';
import {
  useContabilizarVenta,
  useCrearVenta,
  useEditarVenta,
} from '../hooks/use-venta-mutations';
import { ventaFormSchema, type VentaFormValues } from '../schemas/venta-form-schema';
import { LINEA_VENTA_VACIA } from '../types';
import { AnularVentaSheet } from './anular-venta-sheet';
import { EliminarVentaDialog } from './eliminar-venta-dialog';
import { LineasVentaEditor } from './lineas-venta-editor';

export type VentaFormMode = 'nueva' | 'borrador' | 'contabilizado';

const CODIGO_CAJA_GENERAL = '1.1.1.001';

interface VentaFormProps {
  mode: VentaFormMode;
  venta?: Venta;
}

function mapVentaAFormValues(venta: Venta): VentaFormValues {
  return {
    contactoId: venta.contactoId,
    fechaContable: venta.fechaContable,
    condicionPago: venta.condicionPago,
    fechaVencimiento: venta.fechaVencimiento ?? '',
    glosa: venta.glosa,
    cuentaDestinoId: venta.cuentaDestinoId ?? '',
    lineas: venta.lineas.map((l) => ({
      itemId: l.itemId,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
    })),
  };
}

/**
 * Editor de venta — alta y edición (borrador y post-CONTABILIZADO, §4.3).
 *
 * Dos acciones, CERO confirmaciones (REQ-VTA-05, D-08/D-14): "Guardar
 * borrador" (secundario) y "Guardar y contabilizar" (primario) ejecutan
 * directo. La única fricción del flujo es el motivo de anulación (§4.7).
 */
export function VentaForm({ mode, venta }: VentaFormProps): React.JSX.Element {
  const navigate = useNavigate();
  const isNueva = mode === 'nueva';
  const isContabilizado = mode === 'contabilizado';

  const [anularOpen, setAnularOpen] = useState(false);
  const [eliminarOpen, setEliminarOpen] = useState(false);

  const crearMutation = useCrearVenta();
  const editarMutation = useEditarVenta(venta?.id ?? '');
  const contabilizarMutation = useContabilizarVenta();

  // Anti-F-07: cualquier mutación en vuelo deshabilita TODOS los submits.
  const isPending =
    crearMutation.isPending ||
    editarMutation.isPending ||
    contabilizarMutation.isPending;

  const form = useForm<VentaFormValues>({
    resolver: zodResolver(ventaFormSchema),
    defaultValues:
      venta !== undefined
        ? mapVentaAFormValues(venta)
        : {
            contactoId: '',
            fechaContable: hoyEnLaPaz(),
            condicionPago: 'CONTADO',
            fechaVencimiento: '',
            glosa: '',
            cuentaDestinoId: '',
            lineas: [{ ...LINEA_VENTA_VACIA }],
          },
  });

  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;

  const condicionPago = useWatch({ control, name: 'condicionPago' });
  const contactoId = useWatch({ control, name: 'contactoId' });
  const cuentaDestinoId = useWatch({ control, name: 'cuentaDestinoId' });

  // Precarga de Caja General (PA-1): default de UI, una sola vez. Si
  // 1.1.1.001 no existe o no está activa/de detalle, el form no precarga —
  // jamás rompe (REQ-VTA-04 "el default ausente no rompe nada").
  const { data: cuentasData } = useCuentas({
    esDetalle: true,
    activa: true,
    pageSize: 100,
  });
  const precargaHecha = useRef(false);
  const cajaGeneralId = cuentasData?.items.find(
    (c) => c.codigoInterno === CODIGO_CAJA_GENERAL,
  )?.id;
  useEffect(() => {
    if (precargaHecha.current || cajaGeneralId === undefined || isContabilizado) {
      return;
    }
    if (
      form.getValues('condicionPago') === 'CONTADO' &&
      form.getValues('cuentaDestinoId') === ''
    ) {
      // Una sola vez por montaje: si el usuario después la quita a propósito,
      // no se la re-imponemos.
      precargaHecha.current = true;
      setValue('cuentaDestinoId', cajaGeneralId);
    }
  }, [cajaGeneralId, isContabilizado, form, setValue]);

  // REQ-VTA-06 fila 6 (D-14): la advertencia muestra la consecuencia
  // CONCRETA, sin diálogo genérico.
  const cambioContacto =
    isContabilizado && venta !== undefined && contactoId !== venta.contactoId;

  function handleCondicionChange(value: CondicionPago): void {
    setValue('condicionPago', value, { shouldValidate: true });
    if (value === 'CONTADO') {
      // El campo se oculta: si retuviera el valor, la validación cruzada
      // fallaría sobre un campo invisible.
      setValue('fechaVencimiento', '', { shouldValidate: true });
    }
  }

  async function guardar(values: VentaFormValues): Promise<Venta> {
    const payload = mapearFormAPayload(values);
    return isNueva
      ? crearMutation.mutateAsync(payload)
      : editarMutation.mutateAsync(payload);
  }

  async function onGuardarBorrador(values: VentaFormValues): Promise<void> {
    try {
      await guardar(values);
      toast.success(isNueva ? 'Borrador guardado' : 'Cambios guardados');
      void navigate('/ventas');
    } catch (err) {
      toast.error(mensajeVentas(err, 'No se pudo guardar la venta'));
    }
  }

  async function onGuardarYContabilizar(values: VentaFormValues): Promise<void> {
    let guardada: Venta;
    try {
      guardada = await guardar(values);
    } catch (err) {
      toast.error(mensajeVentas(err, 'No se pudo guardar la venta'));
      return;
    }
    if (isNueva) {
      // El borrador YA existe: si contabilizar falla, el usuario queda en el
      // editor del borrador y el retry no duplica la venta.
      void navigate(`/ventas/${guardada.id}/editar`, { replace: true });
    }
    try {
      const res = await contabilizarMutation.mutateAsync(guardada.id);
      toast.success(`Venta contabilizada — ${res.numero}`);
      void navigate('/ventas');
    } catch (err) {
      toast.error(mensajeVentas(err, 'No se pudo contabilizar la venta'));
    }
  }

  async function onGuardarCambios(values: VentaFormValues): Promise<void> {
    try {
      await guardar(values);
      toast.success('Cambios guardados');
      void navigate('/ventas');
    } catch (err) {
      toast.error(mensajeVentas(err, 'No se pudieron guardar los cambios'));
    }
  }

  const permisoGuardar = isNueva
    ? PERMISSIONS.contabilidad.ventas.create
    : PERMISSIONS.contabilidad.ventas.update;

  const titulo = isNueva
    ? 'Nueva venta'
    : isContabilizado
      ? 'Editar venta'
      : 'Editar borrador de venta';

  const descripcion = isNueva
    ? 'Registrá la venta en el idioma del negocio: cliente, ítems, cantidades y precios. El asiento se genera solo.'
    : isContabilizado
      ? 'La venta está contabilizada. Podés editarla mientras el período esté abierto; todo cambio queda auditado.'
      : 'Editá el borrador antes de contabilizar.';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{titulo}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{descripcion}</p>
        </div>
        {venta !== undefined && (
          <div className="flex items-center gap-2 self-start">
            {venta.numero !== null && (
              <span className="font-mono text-sm text-muted-foreground">
                {venta.numero}
              </span>
            )}
            <EstadoComprobanteBadge estado={venta.estado} anulado={venta.anulado} />
          </div>
        )}
      </div>

      {isContabilizado && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-amber-700 dark:text-amber-400 text-sm"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Esta venta está contabilizada: al guardar, su asiento se regenera y
            el cambio queda registrado en auditoría. El número{' '}
            <span className="font-mono">{venta?.numero}</span> no cambia.
          </p>
        </div>
      )}

      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit(
            isContabilizado ? onGuardarCambios : onGuardarYContabilizar,
          )}
          className="space-y-6"
          noValidate
        >
          {/* Cabecera */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente" required error={errors.contactoId?.message}>
              <ContactoCombobox
                value={contactoId === '' ? null : contactoId}
                onSelect={(id) =>
                  setValue('contactoId', id ?? '', { shouldValidate: true })
                }
                aria-invalid={errors.contactoId !== undefined}
                aria-label="Cliente"
                // El default del combobox compartido dice "contacto"; en una
                // venta la contraparte es el CLIENTE (§1: el dominio habla el
                // idioma del negocio). Mismo criterio que la pantalla de cobro.
                placeholder="Seleccionar cliente…"
              />
            </Field>

            <Field
              label="Fecha"
              htmlFor="venta-fecha"
              required
              error={errors.fechaContable?.message}
            >
              <Input
                {...register('fechaContable')}
                id="venta-fecha"
                type="date"
                className="text-base md:text-sm"
                aria-invalid={errors.fechaContable !== undefined}
              />
            </Field>

            <Field label="Condición de pago" required>
              <Select
                value={condicionPago}
                onValueChange={(v) => handleCondicionChange(v as CondicionPago)}
              >
                <SelectTrigger className="w-full" aria-label="Condición de pago">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTADO">Contado</SelectItem>
                  <SelectItem value="CREDITO">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {condicionPago === 'CREDITO' ? (
              <Field
                label="Fecha de vencimiento"
                htmlFor="venta-vencimiento"
                required
                error={errors.fechaVencimiento?.message}
              >
                <Input
                  {...register('fechaVencimiento')}
                  id="venta-vencimiento"
                  type="date"
                  className="text-base md:text-sm"
                  aria-invalid={errors.fechaVencimiento !== undefined}
                />
              </Field>
            ) : (
              <Field
                label="Cuenta destino del dinero"
                required
                error={errors.cuentaDestinoId?.message}
                hint="Cuenta de efectivo o equivalente donde ingresa el pago (ej. Caja General, Bancos)."
              >
                <CuentaAutocomplete
                  value={cuentaDestinoId}
                  onChange={(id) =>
                    setValue('cuentaDestinoId', id, { shouldValidate: true })
                  }
                  placeholder="Elegir cuenta de efectivo…"
                />
              </Field>
            )}
          </div>

          <Field
            label="Glosa"
            htmlFor="venta-glosa"
            required
            error={errors.glosa?.message}
            hint="Describe la operación en el Libro Diario (ej. «Venta de pollo faenado a Avícola Sur»)."
          >
            <Input
              {...register('glosa')}
              id="venta-glosa"
              placeholder="Venta de pollo faenado a Avícola Sur"
              className="text-base md:text-sm"
              aria-invalid={errors.glosa !== undefined}
            />
          </Field>

          {cambioContacto && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-amber-700 dark:text-amber-400 text-sm"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Al cambiar el cliente se desvinculan TODOS los cobros aplicados a
                esta venta: quedarán como saldo a favor del cliente anterior y la
                venta volverá a figurar como pendiente.
              </p>
            </div>
          )}

          {/* Líneas */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Líneas
            </h2>
            <LineasVentaEditor disabled={isPending} />
            {errors.lineas?.root !== undefined && (
              <p className="mt-1.5 text-sm text-destructive">
                {errors.lineas.root.message}
              </p>
            )}
            {typeof errors.lineas?.message === 'string' && (
              <p className="mt-1.5 text-sm text-destructive">
                {errors.lineas.message}
              </p>
            )}
          </div>

          {/* Footer de acciones — dos acciones, cero confirmaciones (D-08). */}
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {mode === 'borrador' && venta !== undefined && (
                // DELETE físico irreversible → única acción con AlertDialog rojo (§14.3).
                <PermissionButton
                  permission={PERMISSIONS.contabilidad.ventas.delete}
                  deniedReason="No tenés permiso para eliminar ventas"
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => setEliminarOpen(true)}
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar borrador
                </PermissionButton>
              )}
              {isContabilizado && venta !== undefined && (
                // Anular es irreversible pero NO es un delete: abre el sheet con
                // motivo (la única fricción del flujo, §4.7).
                <PermissionButton
                  permission={PERMISSIONS.contabilidad.ventas.void}
                  deniedReason="No tenés permiso para anular ventas"
                  type="button"
                  variant="outline"
                  disabled={isPending || venta.anulado}
                  onClick={() => setAnularOpen(true)}
                  className="text-destructive hover:text-destructive w-full sm:w-auto"
                >
                  Anular venta
                </PermissionButton>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void navigate('/ventas')}
                disabled={isPending}
              >
                Cancelar
              </Button>

              {isContabilizado ? (
                <PermissionButton
                  permission={PERMISSIONS.contabilidad.ventas.update}
                  deniedReason="No tenés permiso para modificar ventas"
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    'Guardar cambios'
                  )}
                </PermissionButton>
              ) : (
                <>
                  <PermissionButton
                    permission={permisoGuardar}
                    deniedReason="No tenés permiso para guardar ventas"
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      void form.handleSubmit(onGuardarBorrador)();
                    }}
                    className="w-full sm:w-auto"
                  >
                    Guardar borrador
                  </PermissionButton>
                  <PermissionButton
                    permission={[permisoGuardar, PERMISSIONS.contabilidad.ventas.post]}
                    deniedReason="Necesitás permiso para contabilizar ventas"
                    type="submit"
                    disabled={isPending}
                    className="w-full sm:w-auto"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando…
                      </>
                    ) : (
                      'Guardar y contabilizar'
                    )}
                  </PermissionButton>
                </>
              )}
            </div>
          </div>
        </form>
      </FormProvider>

      {venta !== undefined && (
        <>
          <EliminarVentaDialog
            venta={venta}
            open={eliminarOpen}
            onOpenChange={setEliminarOpen}
          />
          <AnularVentaSheet
            open={anularOpen}
            onOpenChange={setAnularOpen}
            ventaId={venta.id}
            glosa={venta.glosa}
          />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Subcomponente interno de layout (mismo patrón que ItemForm)
// ------------------------------------------------------------

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: FieldProps): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="flex items-center gap-1">
        {label}
        {required === true ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error !== undefined ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint !== undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
