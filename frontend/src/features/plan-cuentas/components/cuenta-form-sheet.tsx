import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { backendErrorMessage } from '@/lib/error-messages';
import type { Cuenta } from '@/types/api';

import { useCreateCuenta, useUpdateCuenta } from '../hooks/use-cuenta-mutations';
import type { CuentaFormValues } from '../schemas/cuenta-form-schema';

import { CuentaForm } from './cuenta-form';

interface CuentaFormSheetProps {
  mode: 'create' | 'edit';
  // initialData es obligatorio en mode=edit.
  initialData?: Cuenta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sheet contenedor del CuentaForm. Orquesta la mutation correcta según
// el mode, maneja toasts y cierre del drawer post-submit exitoso.
export function CuentaFormSheet({
  mode,
  initialData,
  open,
  onOpenChange,
}: CuentaFormSheetProps): React.JSX.Element {
  const createMutation = useCreateCuenta();
  const updateMutation = useUpdateCuenta(initialData?.id ?? null);
  const isSubmitting =
    mode === 'create' ? createMutation.isPending : updateMutation.isPending;

  function handleSubmit(values: CuentaFormValues): void {
    if (mode === 'create') {
      createMutation.mutate(values, {
        onSuccess: (created) => {
          toast.success(`Cuenta ${created.codigoInterno} creada`);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(backendErrorMessage(err, 'No se pudo crear la cuenta'));
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
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>
            {mode === 'create' ? 'Nueva cuenta' : 'Editar cuenta'}
          </SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'El código interno y la clase son inmutables post-creación.'
              : 'Solo se pueden editar los campos no estructurales.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <CuentaForm
            mode={mode}
            {...(initialData !== undefined ? { initialData } : {})}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isSubmitting}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
