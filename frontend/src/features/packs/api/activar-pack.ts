import { api } from '@/lib/api';
import type { ActivacionPack } from '@/types/api';

export async function activarPack(clave: string, activo: boolean): Promise<ActivacionPack> {
  const res = await api.patch<ActivacionPack>(`/api/packs/${clave}`, { activo });
  return res.data;
}
