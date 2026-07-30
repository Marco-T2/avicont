import { api } from '@/lib/api';

// DELETE físico, solo en BORRADOR (el backend responde 409 en cualquier otro estado).
export async function deleteCobro(id: string): Promise<void> {
  await api.delete(`/api/cobros/${id}`);
}
