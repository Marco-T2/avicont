import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarContactosParams } from '@/types/api';

import { getContactos } from '../api/get-contactos';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío —
// muestra la data anterior con un skeleton sutil hasta que llega la nueva.
export function useContactos(params: ListarContactosParams = {}) {
  return useQuery({
    queryKey: ['contactos', params],
    queryFn: () => getContactos(params),
    placeholderData: keepPreviousData,
  });
}
