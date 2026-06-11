import { api } from '@/lib/api';
import type { OrgPackEntitlement } from '@/types/api';

export async function getMisPacks(): Promise<OrgPackEntitlement[]> {
  const res = await api.get<OrgPackEntitlement[]>('/api/packs/mis-packs');
  return res.data;
}
