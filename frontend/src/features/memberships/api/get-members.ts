import { api } from '@/lib/api';
import type { Membership } from '@/types/api';

// GET /api/tenants/current/members — miembros del tenant activo (según JWT).
export async function getMembers(): Promise<Membership[]> {
  const res = await api.get<Membership[]>('/api/tenants/current/members');
  return res.data;
}
