import { api } from '@/lib/api';

// Perfil fiscal de la organización. Estos campos provienen de
// GET /api/tenants/current — el backend los devuelve como null cuando
// no han sido configurados.
export interface EmpresaPerfil {
  razonSocial: string | null;
  nit: string | null;
  direccion: string | null;
  representanteLegal: string | null;
  telefono: string | null;
  email: string | null;
}

// El endpoint devuelve la org completa; extraemos solo los 6 campos fiscales.
interface TenantCurrentResponse {
  id: string;
  name: string;
  razonSocial: string | null;
  nit: string | null;
  direccion: string | null;
  representanteLegal: string | null;
  telefono: string | null;
  email: string | null;
  [key: string]: unknown;
}

export async function getEmpresa(): Promise<EmpresaPerfil> {
  const res = await api.get<TenantCurrentResponse>('/api/tenants/current');
  const { razonSocial, nit, direccion, representanteLegal, telefono, email } = res.data;
  return { razonSocial, nit, direccion, representanteLegal, telefono, email };
}
