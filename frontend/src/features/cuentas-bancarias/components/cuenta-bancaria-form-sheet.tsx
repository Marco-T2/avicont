import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { CuentaBancaria } from '@/types/api';

import {
  useCreateCuentaBancaria,
  useUpdateCuentaBancaria,
} from '../hooks/use-cuenta-bancaria-mutations';
import type { CuentaBancariaFormValues } from '../schemas/cuenta-bancaria-form-schema';

import { CuentaBancariaForm } from './cuenta-bancaria-form';

interface CuentaBancariaFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null/undefined = modo crear; objeto = modo editar.
  cuentaBancaria?: CuentaBancaria | null;
}

// Sheet contenedor del CuentaBancariaForm. Orquesta la mutation correcta
// según si hay una `cuentaBancaria` recibida y cierra el drawer post-submit.
// Los toasts de éxito y error los emiten los hooks (Anti-F-13).
export function CuentaBancariaFormSheet({
  open,
  onOpenChange,
  cuentaBancaria,
}: CuentaBancariaFormSheetProps): React.JSX.Element {
  const mode = cuentaBancaria != null ? 'edit' : 'create';

  const createMutation = useCreateCuentaBancaria();
  const updateMutation = useUpdateCuentaBancaria(cuentaBancaria?.id ?? null);

  const isSubmitting = mode === 'create' ? createMutation.isPending : updateMutation.isPending;

  function handleSubmit(values: CuentaBancariaFormValues): void {
    if (mode === 'create') {
      createMutation.mutate(values, { onSuccess: () => onOpenChange(false) });
      return;
    }
    updateMutation.mutate(values, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden">
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'Nueva cuenta bancaria' : 'Editar cuenta bancaria'}</SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'Vinculá una cuenta del plan a un banco para importar sus extractos.'
              : 'Editá el alias, la moneda o el número de cuenta.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <CuentaBancariaForm
            mode={mode}
            {...(cuentaBancaria != null ? { initialData: cuentaBancaria } : {})}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
