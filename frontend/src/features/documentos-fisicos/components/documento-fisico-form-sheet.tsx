import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { DocumentoFisico } from '@/types/api';

import { useDocumentoFisicoDetalle } from '../hooks/use-documento-fisico-detalle';
import {
  useCreateDocumentoFisico,
  useUpdateDocumentoFisico,
} from '../hooks/use-documento-fisico-mutations';
import {
  mapDetalleToFormValues,
  type DocumentoFisicoFormValues,
} from '../schemas/documento-fisico-form-schema';
import { DocumentoFisicoForm } from './documento-fisico-form';

interface DocumentoFisicoFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null/undefined = modo crear; objeto = modo editar. */
  documento?: DocumentoFisico | null;
}

/**
 * Sheet contenedor del form de documento físico.
 * En mode=edit carga el detalle para obtener comprobantesAsociados (D2).
 * Cierra el sheet en onSuccess de la mutation.
 * Los toasts de éxito y error los emiten los hooks (Anti-F-13).
 */
export function DocumentoFisicoFormSheet({
  open,
  onOpenChange,
  documento,
}: DocumentoFisicoFormSheetProps): React.JSX.Element {
  const mode = documento != null ? 'edit' : 'create';

  // En mode=edit, cargar el detalle para comprobantesAsociados (D2).
  const { data: detalle, isLoading: isLoadingDetalle } = useDocumentoFisicoDetalle(
    mode === 'edit' ? (documento?.id ?? null) : null,
  );

  const createMutation = useCreateDocumentoFisico();
  const updateMutation = useUpdateDocumentoFisico(documento?.id ?? null);

  const isSubmitting =
    mode === 'create' ? createMutation.isPending : updateMutation.isPending;

  function handleSubmit(values: DocumentoFisicoFormValues): void {
    const payload = {
      tipoDocumentoFisicoId: values.tipoDocumentoFisicoId,
      numero: values.numero,
      fechaEmision: values.fechaEmision,
      ...(values.monto !== null ? { monto: values.monto } : {}),
      ...(values.moneda !== null ? { moneda: values.moneda } : {}),
      ...(values.contactoId !== null ? { contactoId: values.contactoId } : {}),
      ...(values.glosa !== null && values.glosa !== '' ? { glosa: values.glosa } : {}),
    };

    if (mode === 'create') {
      createMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
      });
      return;
    }

    updateMutation.mutate(payload, {
      onSuccess: () => onOpenChange(false),
    });
  }

  // En mode=edit mientras carga el detalle: mostrar skeleton.
  const showSkeleton = mode === 'edit' && isLoadingDetalle;

  // Valores iniciales: del detalle en edit, defaults en create.
  const initialValues =
    mode === 'edit' && detalle !== undefined
      ? mapDetalleToFormValues(detalle)
      : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>
            {mode === 'create' ? 'Nuevo documento físico' : 'Editar documento'}
          </SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'Completá los datos del nuevo documento físico.'
              : 'Editá los datos del documento.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          {showSkeleton ? (
            // §14.5: las alturas espejan la estructura real del form
            // (label + control), no un h-10 uniforme. La glosa es una textarea
            // (más alta) y el monto es condicional, por eso el bloque final.
            <div className="space-y-4 pt-4">
              <Skeleton className="h-5 w-28" /> {/* label tipo */}
              <Skeleton className="h-10 w-full" /> {/* select */}
              <Skeleton className="h-5 w-24" /> {/* label número */}
              <Skeleton className="h-10 w-full" /> {/* input */}
              <Skeleton className="h-5 w-20" /> {/* label fecha */}
              <Skeleton className="h-10 w-full" /> {/* input */}
              <Skeleton className="h-5 w-28" /> {/* label contacto */}
              <Skeleton className="h-10 w-full" /> {/* combobox */}
              <Skeleton className="h-5 w-16" /> {/* label glosa */}
              <Skeleton className="h-24 w-full" /> {/* textarea */}
            </div>
          ) : (
            <DocumentoFisicoForm
              mode={mode}
              comprobantesAsociados={detalle?.comprobantesAsociados ?? []}
              {...(initialValues !== undefined ? { initialValues } : {})}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
