import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CreateCustomRoleRequest,
  UpdateCustomRoleRequest,
} from '@/types/api';

import { createRole } from '../api/create-role';
import { deleteRole } from '../api/delete-role';
import { getRoles } from '../api/get-roles';
import { updateRole } from '../api/update-role';

export function useRoles() {
  return useQuery({
    queryKey: ['custom-roles'],
    queryFn: getRoles,
    staleTime: 60_000,
  });
}

function useInvalidateRoles(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['custom-roles'] });
  };
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (body: CreateCustomRoleRequest) => createRole(body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCustomRoleRequest }) =>
      updateRole(id, body),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => invalidate(),
  });
}
