import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { mensajeComprobantes } from '@/lib/error-messages';
import type { Comprobante, Cuenta } from '@/types/api';

import { useCrearComprobante } from '../hooks/use-crear-comprobante';
import { useEditarComprobante } from '../hooks/use-editar-comprobante';
import {
  crearComprobanteSchema,
  type CrearComprobanteValues,
} from '../schemas/crear-comprobante-schema';
import {
  editarComprobanteSchema,
  type EditarComprobanteValues,
} from '../schemas/editar-comprobante-schema';
import type { ComprobanteMode, LineaFormValues } from '../types';
import { LINEA_VACIA } from '../types';
import { ComprobanteCabeceraForm } from './comprobante-cabecera-form';
import { LineasEditor } from './lineas-editor';

interface EditarComprobanteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ComprobanteMode;
  /** Comprobante existente — undefined en mode='nuevo'. */
  comprobante?: Comprobante;
  /**
   * Cuentas de detalle activas para el CuentaAutocomplete del LineasEditor.
   * El padre es responsable de cargarlas con useCuentas({ esDetalle: true, activa: true, pageSize: 200 }).
   */
  cuentas: Cuenta[];
}

// Mapea un comprobante del backend a los valores del form.
function mapComprobanteAForm(
  comprobante: Comprobante,
): Omit<CrearComprobanteValues, 'lineas'> & { lineas: LineaFormValues[]; motivo?: string } {
  return {
    tipo: comprobante.tipo,
    fechaContable: comprobante.fechaContable,
    glosa: comprobante.glosa,
    monedaPrincipal: comprobante.monedaPrincipal,
    lineas: comprobante.lineas.map((l) => ({
      _localKey: crypto.randomUUID(),
      cuentaId: l.cuentaId,
      contactoId: l.contactoId ?? undefined,
      moneda: l.moneda,
      debito: l.debito,
      credito: l.credito,
      tipoCambio: l.tipoCambio,
      debitoBob: l.debitoBob,
      creditoBob: l.creditoBob,
      glosaLinea: l.glosaLinea ?? '',
    })),
  };
}

/**
 * Sheet de creación/edición de comprobante.
 * Orquesta ComprobanteCabeceraForm + LineasEditor bajo un FormProvider compartido.
 *
 * mode='nuevo': usa crearComprobanteSchema + useCrearComprobante.
 * mode='borrador' | 'contabilizado': usa editarComprobanteSchema + useEditarComprobante.
 *
 * En mode='contabilizado': muestra banner ámbar + campo motivo opcional (3-500).
 * El LineasEditor en ese mode arranca disabled + toggle "Reemplazar líneas".
 *
 * Cross-feature: cuentas vienen de useCuentas del módulo plan-cuentas (legítimo,
 * ver design obs 247 §"Resolved lookups").
 */
export function EditarComprobanteSheet({
  open,
  onOpenChange,
  mode,
  comprobante,
  cuentas,
}: EditarComprobanteSheetProps): React.JSX.Element {
  const isNuevo = mode === 'nuevo';
  const isContabilizado = mode === 'contabilizado';

  const crearMutation = useCrearComprobante();
  const editarMutation = useEditarComprobante(comprobante?.id ?? '');

  const isPending = isNuevo ? crearMutation.isPending : editarMutation.isPending;

  // Elegir el schema según el mode
  const schema = isNuevo ? crearComprobanteSchema : editarComprobanteSchema;

  const defaultValues = isNuevo
    ? {
        tipo: 'DIARIO' as const,
        fechaContable: new Date().toISOString().slice(0, 10),
        glosa: '',
        monedaPrincipal: 'BOB' as const,
        lineas: [{ ...LINEA_VACIA, _localKey: crypto.randomUUID() }],
      }
    : comprobante !== undefined
      ? mapComprobanteAForm(comprobante)
      : {
          tipo: 'DIARIO' as const,
          fechaContable: '',
          glosa: '',
          monedaPrincipal: 'BOB' as const,
          lineas: [],
        };

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // Resetear el form cuando cambia el comprobante o el modo
  useEffect(() => {
    if (open) {
      if (isNuevo) {
        form.reset({
          tipo: 'DIARIO',
          fechaContable: new Date().toISOString().slice(0, 10),
          glosa: '',
          monedaPrincipal: 'BOB',
          lineas: [{ ...LINEA_VACIA, _localKey: crypto.randomUUID() }],
        });
      } else if (comprobante !== undefined) {
        form.reset(mapComprobanteAForm(comprobante));
      }
    }
  }, [open, comprobante, isNuevo, form]);

  function onSubmit(values: CrearComprobanteValues | EditarComprobanteValues): void {
    if (isNuevo) {
      const payload = values as CrearComprobanteValues;
      crearMutation.mutate(payload, {
        onSuccess: () => {
          toast.success('Borrador guardado correctamente');
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(mensajeComprobantes(err));
        },
      });
    } else {
      const payload = values as EditarComprobanteValues;
      editarMutation.mutate(payload, {
        onSuccess: () => {
          toast.success('Comprobante actualizado');
          onOpenChange(false);
        },
        onError: (err) => {
          const errObj = err as { response?: { data?: { details?: { orden?: number; campo?: string; message?: string } } } };
          const details = errObj.response?.data?.details;
          // Anclar errores per-fila tras 422 con details.orden (1-indexed del backend).
          if (details?.orden !== undefined && typeof details.orden === 'number') {
            const campo = details.campo ?? 'cuentaId';
            const message = details.message ?? mensajeComprobantes(err);
            form.setError(`lineas.${details.orden - 1}.${campo}` as Parameters<typeof form.setError>[0], {
              message,
            });
          }
          toast.error(mensajeComprobantes(err));
        },
      });
    }
  }

  const titulo = isNuevo
    ? 'Nuevo comprobante'
    : isContabilizado
      ? 'Editar comprobante contabilizado'
      : 'Editar borrador';

  const descripcion = isNuevo
    ? 'Completá la cabecera y las líneas. El comprobante se guardará como borrador.'
    : isContabilizado
      ? 'Podés editar la cabecera. Para cambiar las líneas, activá el toggle "Reemplazar líneas".'
      : 'Editá los datos del borrador antes de contabilizar.';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-4xl overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription>{descripcion}</SheetDescription>
        </SheetHeader>

        {/* Banner ámbar para mode=contabilizado */}
        {isContabilizado && (
          <div
            role="alert"
            className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-amber-700 dark:text-amber-400 text-sm"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Este comprobante está contabilizado. Toda edición queda registrada
              en el historial de auditoría.
            </p>
          </div>
        )}

        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="px-4 py-4 space-y-6"
          >
            {/* Cabecera */}
            <ComprobanteCabeceraForm
              numeroCorrelativo={comprobante?.numero}
              readonlyCabecera={false}
            />

            {/* Motivo (solo en mode=contabilizado) */}
            {isContabilizado && (
              <div className="space-y-1.5">
                <Label htmlFor="editar-motivo">Motivo del cambio (opcional)</Label>
                <Textarea
                  id="editar-motivo"
                  placeholder="Describí brevemente el motivo del cambio para auditoría"
                  className="text-base md:text-sm min-h-[72px] w-full max-w-full resize-y [field-sizing:fixed]"
                  {...form.register('motivo')}
                />
                {form.formState.errors.motivo !== undefined && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.motivo.message as string}
                  </p>
                )}
              </div>
            )}

            {/* LineasEditor */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Líneas
              </h3>
              <LineasEditor mode={mode} cuentas={cuentas} />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : isNuevo ? (
                  'Guardar borrador'
                ) : (
                  'Guardar cambios'
                )}
              </Button>
            </div>
          </form>
        </FormProvider>
      </SheetContent>
    </Sheet>
  );
}
