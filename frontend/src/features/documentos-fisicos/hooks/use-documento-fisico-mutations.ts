import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { mensajeDocumentosFisicos } from '@/lib/error-messages';
import type { CreateDocumentoFisicoRequest, UpdateDocumentoFisicoRequest } from '@/types/api';

import { createDocumentoFisico } from '../api/create-documento-fisico';
import { eliminarDocumentoFisico } from '../api/eliminar-documento-fisico';
import { updateDocumentoFisico } from '../api/update-documento-fisico';

// Invalida todo el cache de documentos-fisicos de la feature.
// Usado post-mutation: lista paginada + detalle quedan stale → re-fetch.
export function useInvalidateDocumentosFisicos(): () => void {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['documentos-fisicos'] });
}

export function useCreateDocumentoFisico() {
  const invalidate = useInvalidateDocumentosFisicos();
  return useMutation({
    mutationFn: (body: CreateDocumentoFisicoRequest) => createDocumentoFisico(body),
    onSuccess: () => {
      invalidate();
      toast.success('Documento creado correctamente');
    },
    onError: (err) => {
      toast.error(mensajeDocumentosFisicos(err));
    },
  });
}

export function useUpdateDocumentoFisico(id: string | null) {
  const invalidate = useInvalidateDocumentosFisicos();
  return useMutation({
    mutationFn: (body: UpdateDocumentoFisicoRequest) => {
      if (id === null) throw new Error('id requerido para updateDocumentoFisico');
      return updateDocumentoFisico(id, body);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Documento actualizado correctamente');
    },
    onError: (err) => {
      toast.error(mensajeDocumentosFisicos(err));
    },
  });
}

// Anti-F-13: useEliminarDocumentoFisico NO tiene onError propio.
// El dialog de confirmación maneja el error (toast + preventDefault para no cerrar).
export function useEliminarDocumentoFisico() {
  const invalidate = useInvalidateDocumentosFisicos();
  return useMutation({
    mutationFn: (id: string) => eliminarDocumentoFisico(id),
    onSuccess: () => {
      invalidate();
      toast.success('Documento eliminado correctamente');
    },
  });
}
