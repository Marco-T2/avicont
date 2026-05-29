import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { TipoDocumentoFisico } from '@/types/api';

import {
  useCreateTipoDocumentoFisico,
  useUpdateTipoDocumentoFisico,
} from '../hooks/use-tipo-documento-fisico-mutations';
import type { TipoDocumentoFisicoFormValues } from '../schemas/tipo-documento-fisico-form-schema';

import { TipoDocumentoFisicoForm } from './tipo-documento-fisico-form';

interface TipoDocumentoFisicoFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null/undefined = modo crear; objeto = modo editar.
  tipo?: TipoDocumentoFisico | null;
}

// Sheet contenedor del TipoDocumentoFisicoForm. Orquesta la mutation correcta
// según si hay un `tipo` recibido y cierra el drawer post-submit.
// Los toasts de éxito y error los emiten los hooks (Anti-F-13).
export function TipoDocumentoFisicoFormSheet({
  open,
  onOpenChange,
  tipo,
}: TipoDocumentoFisicoFormSheetProps): React.JSX.Element {
  const mode = tipo != null ? 'edit' : 'create';

  const createMutation = useCreateTipoDocumentoFisico();
  const updateMutation = useUpdateTipoDocumentoFisico(tipo?.id ?? null);

  const isSubmitting =
    mode === 'create' ? createMutation.isPending : updateMutation.isPending;

  function handleSubmit(values: TipoDocumentoFisicoFormValues): void {
    if (mode === 'create') {
      createMutation.mutate(values, {
        onSuccess: () => {
          onOpenChange(false);
        },
      });
      return;
    }
    updateMutation.mutate(values, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>
            {mode === 'create' ? 'Nuevo tipo' : 'Editar tipo'}
          </SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'Completá los datos del nuevo tipo de documento físico.'
              : 'Editá los datos del tipo de documento.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <TipoDocumentoFisicoForm
            mode={mode}
            {...(tipo != null ? { initialData: tipo } : {})}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
