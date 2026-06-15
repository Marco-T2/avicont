import { api } from '@/lib/api';
import type { TipoEmpresa } from '@/types/api';

// Perfil fiscal de la organización: los 6 campos que aparecen en la cabecera
// de informes contables. Provienen de GET /api/tenants/current.
// El backend los devuelve como null cuando no han sido configurados.
//
// Este tipo es la superficie compartida con `cabecera-fiscal.ts` y los botones
// de exportación — solo los 6 campos de texto nullable.
export interface EmpresaPerfil {
  razonSocial: string | null;
  nit: string | null;
  direccion: string | null;
  representanteLegal: string | null;
  telefono: string | null;
  email: string | null;
}

// Respuesta completa de GET /api/tenants/current — extiende EmpresaPerfil con
// los campos de selección de tipo de empresa y su flag de editabilidad.
// Usado por empresa-page.tsx y empresa-form.tsx.
export interface EmpresaPerfilCompleto extends EmpresaPerfil {
  // tipoEmpresaPrincipal puede ser null si nunca fue configurado.
  tipoEmpresaPrincipal: TipoEmpresa | null;
  // false si ya existe al menos una gestión fiscal (inmutable por regulación).
  tipoEmpresaEditable: boolean;
}

// El endpoint devuelve la org completa; extraemos los campos necesarios.
interface TenantCurrentResponse {
  id: string;
  name: string;
  razonSocial: string | null;
  nit: string | null;
  direccion: string | null;
  representanteLegal: string | null;
  telefono: string | null;
  email: string | null;
  tipoEmpresaPrincipal: TipoEmpresa | null;
  tipoEmpresaEditable: boolean;
  [key: string]: unknown;
}

export async function getEmpresa(): Promise<EmpresaPerfilCompleto> {
  const res = await api.get<TenantCurrentResponse>('/api/tenants/current');
  const {
    razonSocial,
    nit,
    direccion,
    representanteLegal,
    telefono,
    email,
    tipoEmpresaPrincipal,
    tipoEmpresaEditable,
  } = res.data;
  return {
    razonSocial,
    nit,
    direccion,
    representanteLegal,
    telefono,
    email,
    tipoEmpresaPrincipal,
    tipoEmpresaEditable,
  };
}
