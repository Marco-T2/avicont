import { useQuery } from '@tanstack/react-query';

import { getPacksCatalogo } from '../api/get-packs-catalogo';

/**
 * Catálogo global de packs vendibles (super-admin, org-less).
 * No depende de ninguna org — los datos son globales de plataforma.
 * Query key estable: ['platform-packs-catalogo']
 */
export function usePacksCatalogo() {
  return useQuery({
    queryKey: ['platform-packs-catalogo'],
    queryFn: getPacksCatalogo,
  });
}
