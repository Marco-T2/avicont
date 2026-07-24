import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';

import { createCuentaBancaria } from '../api/create-cuenta-bancaria';
import { eliminarCuentaBancaria } from '../api/eliminar-cuenta-bancaria';
import { updateCuentaBancaria } from '../api/update-cuenta-bancaria';
import type { CuentaBancariaFormValues } from '../schemas/cuenta-bancaria-form-schema';

export function useInvalidateCuentasBancarias(): () => void {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['cuentas-bancarias'] });
}

export function useCreateCuentaBancaria() {
  const invalidate = useInvalidateCuentasBancarias();
  return useMutation({
    mutationFn: (values: CuentaBancariaFormValues) => createCuentaBancaria(values),
    onSuccess: () => {
      invalidate();
      toast.success('Cuenta bancaria creada correctamente');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo crear la cuenta bancaria'));
    },
  });
}

export function useUpdateCuentaBancaria(id: string | null) {
  const invalidate = useInvalidateCuentasBancarias();
  return useMutation({
    mutationFn: (values: CuentaBancariaFormValues) => {
      if (id === null) throw new Error('id requerido para updateCuentaBancaria');
      return updateCuentaBancaria(id, values);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Cuenta bancaria actualizada');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo actualizar la cuenta bancaria'));
    },
  });
}

export function useEliminarCuentaBancaria() {
  const invalidate = useInvalidateCuentasBancarias();
  return useMutation({
    mutationFn: (id: string) => eliminarCuentaBancaria(id),
    onSuccess: () => {
      invalidate();
      toast.success('Cuenta bancaria eliminada');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo eliminar la cuenta bancaria'));
    },
  });
}
