import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { mensajeComprobantes } from '@/lib/error-messages';
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';
import type { Comprobante } from '@/types/api';

import { useComprobante } from '../hooks/use-comprobante';
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

function PageSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

interface EditorFormProps {
  mode: ComprobanteMode;
  comprobante?: Comprobante;
}

/**
 * Formulario de edición/creación de comprobante.
 * Lógica extraída del EditarComprobanteSheet pero sin wrappers de Sheet.
 * Se usa dentro de EditarComprobantePage (página dedicada).
 */
function EditorForm({ mode, comprobante }: EditorFormProps): React.JSX.Element {
  const navigate = useNavigate();
  const isNuevo = mode === 'nuevo';
  const isContabilizado = mode === 'contabilizado';

  // Cross-feature: cuentas de detalle activas para el CuentaAutocomplete del LineasEditor.
  // pageSize 100 = límite del backend (ListarCuentasQueryDto @Max(100)). Si un tenant
  // supera 100 cuentas de detalle, migrar a server-side search con el param `search`.
  const { data: cuentasData } = useCuentas({
    esDetalle: true,
    activa: true,
    pageSize: 100,
  });
  const cuentas = cuentasData?.items ?? [];

  const crearMutation = useCrearComprobante();
  const editarMutation = useEditarComprobante(comprobante?.id ?? '');

  const isPending = isNuevo ? crearMutation.isPending : editarMutation.isPending;

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

  // Resetear el form cuando cambia el comprobante o el modo (cambio de ruta).
  useEffect(() => {
    if (isNuevo) {
      // _localKey es un campo local que no forma parte del schema zod — por eso
      // el cast: el resolver lo ignora, pero useForm lo necesita para el key estable.
      form.reset({
        tipo: 'DIARIO',
        fechaContable: new Date().toISOString().slice(0, 10),
        glosa: '',
        monedaPrincipal: 'BOB',
        lineas: [{ ...LINEA_VACIA, _localKey: crypto.randomUUID() }],
      } as unknown as Parameters<typeof form.reset>[0]);
    } else if (comprobante !== undefined) {
      form.reset(mapComprobanteAForm(comprobante));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comprobante?.id, isNuevo]);

  function handleCancelar(): void {
    // Usar ruta explícita para no sacar al usuario de la app si llegó por URL directa.
    if (comprobante !== undefined) {
      void navigate(`/comprobantes/${comprobante.id}`);
    } else {
      void navigate('/comprobantes');
    }
  }

  function onSubmit(values: CrearComprobanteValues | EditarComprobanteValues): void {
    if (isNuevo) {
      const payload = values as CrearComprobanteValues;
      crearMutation.mutate(payload, {
        onSuccess: (nuevoComprobante) => {
          toast.success('Borrador guardado correctamente');
          // El backend devuelve el Comprobante completo con id — navegar al detail.
          void navigate(`/comprobantes/${nuevoComprobante.id}`);
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
          void navigate(`/comprobantes/${comprobante?.id ?? ''}`);
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
    <div className="space-y-4 p-4 md:p-6">
      {/* Back / breadcrumb */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCancelar}
        className="gap-1 -ml-2"
      >
        <ChevronLeft className="h-4 w-4" />
        {comprobante !== undefined ? 'Volver al comprobante' : 'Comprobantes'}
      </Button>

      {/* Header de página */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{descripcion}</p>
      </div>

      {/* Banner ámbar para mode=contabilizado */}
      {isContabilizado && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-amber-700 dark:text-amber-400 text-sm"
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
          className="space-y-6"
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
              {(form.formState.errors as { motivo?: { message?: string } }).motivo !== undefined && (
                <p className="text-sm text-destructive">
                  {(form.formState.errors as { motivo?: { message?: string } }).motivo?.message}
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
            {/* Error de partida doble — generado por superRefinePartidaDoble en el schema (REQ-COMP-UI-EDIT-12). */}
            {form.formState.errors.lineas?.root !== undefined && (
              <p className="mt-1.5 text-sm text-destructive">
                {form.formState.errors.lineas.root.message}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelar}
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
    </div>
  );
}

/**
 * Página dedicada de creación/edición de comprobante.
 *
 * Rutas:
 *   /comprobantes/nuevo         → mode='nuevo', sin :id
 *   /comprobantes/:id/editar    → mode='borrador' | 'contabilizado' según estado
 *
 * Deriva el mode a partir del estado del comprobante. Comprobantes anulados o
 * bloqueados muestran un error UX en lugar del form (el backend igual rechazaría).
 */
export function EditarComprobantePage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNuevo = id === undefined;

  const { data: comprobante, isLoading, isError } = useComprobante(id ?? '');

  if (isNuevo) {
    return <EditorForm mode="nuevo" />;
  }

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

  // Comprobantes bloqueados o anulados no son editables en la UI.
  const esEditable =
    !comprobante.anulado &&
    (comprobante.estado === 'BORRADOR' || comprobante.estado === 'CONTABILIZADO');

  if (!esEditable) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Este comprobante no se puede editar.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void navigate(`/comprobantes/${id}`)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver al comprobante
        </Button>
      </div>
    );
  }

  const mode: ComprobanteMode =
    comprobante.estado === 'BORRADOR' ? 'borrador' : 'contabilizado';

  return <EditorForm mode={mode} comprobante={comprobante} />;
}
