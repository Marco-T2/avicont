import { api } from '@/lib/api';
import type { CuentaTreeNode } from '@/types/api';

export async function getCuentaTree(): Promise<CuentaTreeNode[]> {
  const res = await api.get<CuentaTreeNode[]>('/api/cuentas/tree');
  return res.data;
}
