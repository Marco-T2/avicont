import { useQuery } from '@tanstack/react-query';

import { getCuentaTree } from '../api/get-cuenta-tree';

export function useCuentaTree() {
  return useQuery({
    queryKey: ['cuentas', 'tree'],
    queryFn: getCuentaTree,
    // El árbol cambia muy poco; 60s de stale es razonable y evita refetch
    // al hacer toggle de tabs (Lista ↔ Árbol) en la misma página.
    staleTime: 60_000,
  });
}
