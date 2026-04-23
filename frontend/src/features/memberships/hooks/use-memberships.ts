import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { backendErrorMessage } from '@/lib/error-messages';

import { getMembers } from '../api/get-members';
import { removeMembership } from '../api/remove-membership';
import { updateMembership } from '../api/update-membership';

export function useMembers() {
  return useQuery({
    queryKey: ['memberships'],
    queryFn: getMembers,
    staleTime: 30_000,
  });
}

function useInvalidateMemberships(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['memberships'] });
  };
}

export function useUpdateMembership() {
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: (args: Parameters<typeof updateMembership>[0] extends string ? never : never) =>
      updateMembership(args as never, args as never),
    // Signature override: usamos una forma más tipada abajo.
    onSuccess: () => invalidate(),
  });
}

// Versión tipada sin hacks (la anterior es placeholder; usamos esta en la UI).
export function useChangeMembershipRole() {
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      systemRole?: 'OWNER' | 'ADMIN';
      customRoleId?: string;
    }) => {
      const { id, ...body } = vars;
      return updateMembership(id, body);
    },
    onSuccess: () => invalidate(),
  });
}

export function useRemoveMembership() {
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: (id: string) => removeMembership(id),
    onSuccess: () => invalidate(),
  });
}

export { backendErrorMessage };
