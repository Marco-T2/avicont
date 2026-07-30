import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';

import { PermissionButton } from '@/components/shared/permission-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PERMISSIONS } from '@/lib/permissions';
import type { Cobro } from '@/types/api';

// Cross-feature: badge de estado del comprobante (el cobro hereda el estado
// de su comprobante INGRESO, D-11).
import { EstadoComprobanteBadge } from '@/features/comprobantes/components/estado-comprobante-badge';
// Cross-feature: ventas abiertas del cliente en orden FIFO del backend, para
// gestionar aplicaciones. Hook de la feature estado-cuenta; solo se consume.
import { useEstadoCuenta } from '@/features/estado-cuenta/hooks/use-estado-cuenta';

import { AnularCobroDialog } from '../components/anular-cobro-dialog';
import { AplicacionesEditor } from '../components/aplicaciones-editor';
import { CobroAccionesBar } from '../components/cobro-acciones-bar';
import { CobroCabeceraFields } from '../components/cobro-cabecera-fields';
import { EliminarCobroDialog } from '../components/eliminar-cobro-dialog';
import { useCobro } from '../hooks/use-cobro';
import { useUpdateCobro } from '../hooks/use-cobro-mutations';
import { cobroFormSchema, type CobroFormValues } from '../schemas/cobro-form-schema';

/**
 * Edición del cobro + gestión de aplicaciones (REQ-CXC-06):
 * - El PUT es full-state; cambiar el cliente desvincula TODAS las
 *   aplicaciones — la advertencia aparece ANTES de guardar.
 * - Bajar el monto por debajo de lo aplicado lo rechaza el backend
 *   (COBRO_MONTO_INFERIOR_APLICADO): el usuario desaplica primero.
 * - Anulado = read-only terminal (§4.7).
 */
export function EditarCobroPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cobro, isLoading, isError } = useCobro(id ?? '');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || cobro === undefined) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          Cobro no encontrado o no tenés acceso.
        </p>
        <Button variant="outline" onClick={() => void navigate('/cobros')}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver a cobros
        </Button>
      </div>
    );
  }

  // key: si el server devuelve otro cobro (navegación entre ids), remonta el
  // form con los defaults nuevos.
  return <EditarCobroForm key={cobro.id} cobro={cobro} />;
}

function EditarCobroForm({ cobro }: { cobro: Cobro }): React.JSX.Element {
  const navigate = useNavigate();
  const [anularOpen, setAnularOpen] = useState(false);
  const [eliminarOpen, setEliminarOpen] = useState(false);

  const updateMutation = useUpdateCobro(cobro.id);

  const form = useForm<CobroFormValues>({
    resolver: zodResolver(cobroFormSchema),
    defaultValues: {
      contactoId: cobro.contactoId,
      fechaContable: cobro.fechaContable,
      monto: cobro.monto,
      cuentaDestinoId: cobro.cuentaDestinoId,
      glosa: cobro.glosa,
    },
  });
  const { control, handleSubmit, reset } = form;

  const contactoId = useWatch({ control, name: 'contactoId' });

  const estadoCuenta = useEstadoCuenta(cobro.contactoId);

  const readOnly = cobro.anulado;
  // REQ-CXC-06 fila 12: el usuario se entera ANTES de guardar.
  const cambioContactoConAplicaciones =
    contactoId !== cobro.contactoId && cobro.aplicaciones.length > 0;

  function onSubmit(values: CobroFormValues): void {
    updateMutation.mutate(
      {
        contactoId: values.contactoId,
        fechaContable: values.fechaContable,
        monto: values.monto,
        cuentaDestinoId: values.cuentaDestinoId,
        glosa: values.glosa.trim(),
      },
      {
        onSuccess: (actualizado) => {
          reset({
            contactoId: actualizado.contactoId,
            fechaContable: actualizado.fechaContable,
            monto: actualizado.monto,
            cuentaDestinoId: actualizado.cuentaDestinoId,
            glosa: actualizado.glosa,
          });
        },
      },
    );
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold">
              {cobro.numero ?? 'Cobro en borrador'}
            </h1>
            <EstadoComprobanteBadge estado={cobro.estado} anulado={cobro.anulado} />
          </div>
          <p className="text-sm md:text-base text-muted-foreground">
            Editá el cobro y gestioná sus aplicaciones a ventas.
          </p>
        </div>
        <CobroAccionesBar
          cobro={cobro}
          onAnular={() => setAnularOpen(true)}
          onEliminar={() => setEliminarOpen(true)}
        />
      </div>

      {cobro.anulado && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          Este cobro está anulado: se preserva como registro y no admite cambios.
          Sus aplicaciones fueron eliminadas y las ventas volvieron a quedar
          pendientes.
        </div>
      )}

      <form
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        className="space-y-4"
        noValidate
      >
        <CobroCabeceraFields form={form} disabled={readOnly || updateMutation.isPending} />

        {cambioContactoConAplicaciones && (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
            role="alert"
          >
            <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <p>
              Cambiar el cliente <strong>desvincula TODAS las aplicaciones</strong>{' '}
              de este cobro ({cobro.aplicaciones.length}): las ventas del cliente
              anterior vuelven a quedar pendientes.
            </p>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <PermissionButton
              permission={PERMISSIONS.contabilidad.cobros.update}
              deniedReason="No tenés permiso para modificar cobros"
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full sm:w-auto"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar cambios'
              )}
            </PermissionButton>
          </div>
        )}
      </form>

      <AplicacionesEditor
        cobro={cobro}
        ventasAbiertas={estadoCuenta.data?.ventas}
        disabled={readOnly}
      />

      <AnularCobroDialog
        open={anularOpen}
        onOpenChange={setAnularOpen}
        cobroId={cobro.id}
        cantidadAplicaciones={cobro.aplicaciones.length}
      />

      <EliminarCobroDialog
        open={eliminarOpen}
        onOpenChange={setEliminarOpen}
        cobroId={cobro.id}
        glosa={cobro.glosa}
      />
    </div>
  );
}
