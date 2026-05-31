import { useQuery } from '@tanstack/react-query';

import { getAssignableRoles } from '../api/get-assignable-roles';

// Hook para consultar los roles asignables del tenant activo.
// La query se habilita SOLO cuando el dialog está abierto (open: true)
// para evitar requests innecesarias.
export function useAssignableRoles(open: boolean) {
  return useQuery({
    queryKey: ['memberships', 'assignable-roles'],
    queryFn: getAssignableRoles,
    enabled: open,
  });
}
