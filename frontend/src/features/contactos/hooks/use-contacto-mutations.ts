import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ContactoInput } from '@/types/api';

import { createContacto } from '../api/create-contacto';
import { desactivarContacto } from '../api/desactivar-contacto';
import { reactivarContacto } from '../api/reactivar-contacto';
import { updateContacto } from '../api/update-contacto';

// Invalida todo el cache de contactos de la feature. Usado post-mutation:
// lista paginada y detalle individual quedan stale → re-fetch en el próximo
// render de cada consumidor.
export function useInvalidateContactos(): () => void {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['contactos'] });
}

export function useCreateContacto() {
  const invalidate = useInvalidateContactos();
  return useMutation({
    mutationFn: (values: ContactoInput) => createContacto(values),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateContacto(id: string | null) {
  const invalidate = useInvalidateContactos();
  return useMutation({
    mutationFn: (values: ContactoInput) => {
      if (id === null) throw new Error('id requerido para updateContacto');
      return updateContacto(id, values);
    },
    onSuccess: () => invalidate(),
  });
}

export function useDesactivarContacto() {
  const invalidate = useInvalidateContactos();
  return useMutation({
    mutationFn: (id: string) => desactivarContacto(id),
    onSuccess: () => invalidate(),
  });
}

export function useReactivarContacto() {
  const invalidate = useInvalidateContactos();
  return useMutation({
    mutationFn: (id: string) => reactivarContacto(id),
    onSuccess: () => invalidate(),
  });
}
