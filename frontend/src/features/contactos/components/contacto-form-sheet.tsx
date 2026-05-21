import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { backendErrorMessage } from '@/lib/error-messages';
import type { Contacto } from '@/types/api';

import { useCreateContacto, useUpdateContacto } from '../hooks/use-contacto-mutations';
import type { ContactoFormValues } from '../schemas/contacto-form-schema';

import { ContactoForm } from './contacto-form';

interface ContactoFormSheetProps {
  mode: 'create' | 'edit';
  // initialData es obligatorio en mode=edit.
  initialData?: Contacto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sheet contenedor del ContactoForm. Orquesta la mutation correcta según
// el mode, maneja toasts y cierre del drawer post-submit exitoso.
export function ContactoFormSheet({
  mode,
  initialData,
  open,
  onOpenChange,
}: ContactoFormSheetProps): React.JSX.Element {
  const createMutation = useCreateContacto();
  const updateMutation = useUpdateContacto(initialData?.id ?? null);
  const isSubmitting =
    mode === 'create' ? createMutation.isPending : updateMutation.isPending;

  function handleSubmit(values: ContactoFormValues): void {
    if (mode === 'create') {
      createMutation.mutate(values, {
        onSuccess: () => {
          toast.success('Contacto creado');
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(backendErrorMessage(err, 'No se pudo crear el contacto'));
        },
      });
      return;
    }
    updateMutation.mutate(values, {
      onSuccess: () => {
        toast.success('Cambios guardados');
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(backendErrorMessage(err, 'No se pudieron guardar los cambios'));
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
            {mode === 'create' ? 'Nuevo contacto' : 'Editar contacto'}
          </SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'Completá los datos del cliente o proveedor.'
              : 'Editá los datos del contacto.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <ContactoForm
            mode={mode}
            {...(initialData !== undefined ? { initialData } : {})}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
