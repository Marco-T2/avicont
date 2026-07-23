import { api } from '@/lib/api';

export async function eliminarCuentaBancaria(id: string): Promise<void> {
  await api.delete(`/api/cuentas-bancarias/${id}`);
}
