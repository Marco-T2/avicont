import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';

import { createTipoDocumentoFisico } from '../api/create-tipo-documento-fisico';
import { setActivoTipoDocumentoFisico } from '../api/set-activo-tipo-documento-fisico';
import { updateTipoDocumentoFisico } from '../api/update-tipo-documento-fisico';
import type { TipoDocumentoFisicoFormValues } from '../schemas/tipo-documento-fisico-form-schema';

// Invalida todo el cache de tipos-documento-fisico de la feature.
// Usado post-mutation: lista paginada queda stale → re-fetch en el próximo render.
export function useInvalidateTiposDocumentoFisico(): () => void {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['tipos-documento-fisico'] });
}

export function useCreateTipoDocumentoFisico() {
  const invalidate = useInvalidateTiposDocumentoFisico();
  return useMutation({
    mutationFn: (values: TipoDocumentoFisicoFormValues) =>
      createTipoDocumentoFisico(values),
    onSuccess: () => {
      invalidate();
      toast.success('Tipo de documento creado correctamente');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo crear el tipo de documento'));
    },
  });
}

export function useUpdateTipoDocumentoFisico(id: string | null) {
  const invalidate = useInvalidateTiposDocumentoFisico();
  return useMutation({
    mutationFn: (values: TipoDocumentoFisicoFormValues) => {
      if (id === null) throw new Error('id requerido para updateTipoDocumentoFisico');
      return updateTipoDocumentoFisico(id, values);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Tipo de documento actualizado');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo actualizar el tipo de documento'));
    },
  });
}

export function useSetActivoTipoDocumentoFisico() {
  const invalidate = useInvalidateTiposDocumentoFisico();
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      setActivoTipoDocumentoFisico(id, activo),
    onSuccess: (_data, { activo }) => {
      invalidate();
      toast.success(
        activo ? 'Tipo de documento activado' : 'Tipo de documento desactivado',
      );
    },
    onError: (err) => {
      toast.error(
        backendErrorMessage(err, 'No se pudo cambiar el estado del tipo de documento'),
      );
    },
  });
}
