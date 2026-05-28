import { api } from '@/lib/api';
import type { AuditoriaEntry } from '@/types/api';

export async function getAuditoria(comprobanteId: string): Promise<AuditoriaEntry[]> {
  const res = await api.get<AuditoriaEntry[]>(`/api/comprobantes/${comprobanteId}/auditoria`);
  return res.data;
}
