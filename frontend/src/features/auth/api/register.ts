import { api } from '@/lib/api';
import type { RegisterRequest, RegisterResponse } from '@/types/api';

// POST /api/auth/register — crea SOLO el usuario, sin organización.
// La organización se crea aparte vía POST /api/tenants una vez logueado
// (ver la orquestación en register-form.tsx). El backend NO crea tenant acá.
export async function registerUser(
  body: RegisterRequest,
): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>('/api/auth/register', body);
  return res.data;
}
