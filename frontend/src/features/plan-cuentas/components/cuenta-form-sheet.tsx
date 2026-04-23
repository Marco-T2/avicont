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
  /** Solo en mode=create: valores sugeridos (ej. desde "Agregar hija" del árbol). */
  prefill?: Partial<CuentaFormValues>;
  /** Contexto del padre cuando se crea una hija — renderiza breadcrumb. */
  breadcrumbParent?: Pick<Cuenta, 'codigoInterno' | 'nombre'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sheet contenedor del CuentaForm. Orquesta la mutation correcta según
// el mode, maneja toasts y cierre del drawer post-submit exitoso.
export function CuentaFormSheet({
  mode,
  initialData,
  prefill,
  breadcrumbParent,
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
        // max-w-3xl (768px) + overflow-x-hidden: los forms con selects largos
        // (cuenta padre muestra "codigo + nombre completo") no tienen espacio
        // en 672px. 768px es más cómodo sin invadir mobile.
        className="w-full sm:max-w-3xl overflow-y-auto overflow-x-hidden"
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
            {...(prefill !== undefined ? { prefill } : {})}
            {...(breadcrumbParent !== undefined ? { breadcrumbParent } : {})}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isSubmitting}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
