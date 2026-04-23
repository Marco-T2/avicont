import { api } from '@/lib/api';
import type { UserProfile } from '@/types/api';

// GET /api/users/me — devuelve el perfil del user logueado con la lista
// completa de tenants donde es miembro (cada uno con su rol efectivo).
export async function getMyProfile(): Promise<UserProfile> {
  const res = await api.get<UserProfile>('/api/users/me');
  return res.data;
}
