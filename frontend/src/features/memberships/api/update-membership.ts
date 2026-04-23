import { api } from '@/lib/api';
import type { Membership, UpdateMembershipRequest } from '@/types/api';

// PATCH /api/memberships/:id — cambiar rol (systemRole XOR customRoleId).
// El backend valida que se mande exactamente uno de los dos.
export async function updateMembership(
  id: string,
  body: UpdateMembershipRequest,
): Promise<Membership> {
  const res = await api.patch<Membership>(`/api/memberships/${id}`, body);
  return res.data;
}
