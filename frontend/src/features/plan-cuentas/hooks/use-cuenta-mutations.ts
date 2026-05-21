import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CuentaFormValues } from '../schemas/cuenta-form-schema';
import { createCuenta } from '../api/create-cuenta';
import { deactivateCuenta } from '../api/deactivate-cuenta';
import { updateCuenta } from '../api/update-cuenta';

// Invalida todo el cache de cuentas de la feature. Usado post-mutation:
// lista paginada, árbol y detalle individual quedan stale → re-fetch
// en el próximo render de cada consumidor.
function useInvalidateCuentas(): () => void {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['cuentas'] });
}

export function useCreateCuenta() {
  const invalidate = useInvalidateCuentas();
  return useMutation({
    mutationFn: (values: CuentaFormValues) => createCuenta(values),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCuenta(id: string | null) {
  const invalidate = useInvalidateCuentas();
  return useMutation({
    mutationFn: (values: CuentaFormValues) => {
      if (id === null) throw new Error('id requerido para updateCuenta');
      return updateCuenta(id, values);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeactivateCuenta() {
  const invalidate = useInvalidateCuentas();
  return useMutation({
    mutationFn: (id: string) => deactivateCuenta(id),
    onSuccess: () => invalidate(),
  });
}
