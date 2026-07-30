import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createItem } from '../api/create-item';
import { desactivarItem } from '../api/desactivar-item';
import { reactivarItem } from '../api/reactivar-item';
import { updateItem } from '../api/update-item';
import { mensajeItems } from '../lib/mensaje-items';
import type { ItemFormValues } from '../schemas/item-form-schema';

// Invalida todo el cache de items de la feature. Usado post-mutation:
// la lista paginada queda stale → re-fetch en el próximo render.
export function useInvalidateItems(): () => void {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['items'] });
}

export function useCreateItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (values: ItemFormValues) => createItem(values),
    onSuccess: () => {
      invalidate();
      toast.success('Ítem creado');
    },
    onError: (err) => {
      toast.error(mensajeItems(err, 'No se pudo crear el ítem'));
    },
  });
}

export function useUpdateItem(id: string | null) {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (values: ItemFormValues) => {
      if (id === null) throw new Error('id requerido para updateItem');
      return updateItem(id, values);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Cambios guardados');
    },
    onError: (err) => {
      toast.error(mensajeItems(err, 'No se pudieron guardar los cambios'));
    },
  });
}

export function useDesactivarItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (id: string) => desactivarItem(id),
    onSuccess: () => {
      invalidate();
      toast.success('Ítem desactivado');
    },
    onError: (err) => {
      toast.error(mensajeItems(err, 'No se pudo desactivar el ítem'));
    },
  });
}

export function useReactivarItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (id: string) => reactivarItem(id),
    onSuccess: () => {
      invalidate();
      toast.success('Ítem reactivado');
    },
    onError: (err) => {
      toast.error(mensajeItems(err, 'No se pudo reactivar el ítem'));
    },
  });
}
