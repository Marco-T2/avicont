import { api } from '@/lib/api';
import type { Cuenta } from '@/types/api';

// Backend: DELETE /api/cuentas/:id es desactivación (activa=false), NO
// eliminación física (ver backend/src/cuentas/cuentas.controller.ts).
export async function deactivateCuenta(id: string): Promise<Cuenta> {
  const res = await api.delete<Cuenta>(`/api/cuentas/${id}`);
  return res.data;
}
