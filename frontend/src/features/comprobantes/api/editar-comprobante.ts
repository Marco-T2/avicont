import { api } from '@/lib/api';
import type { Comprobante, Moneda, TipoComprobante } from '@/types/api';

import type { CrearLineaPayload } from './crear-comprobante';

// PATCH /api/comprobantes/:id — sirve para BORRADOR y CONTABILIZADO.
// Todos los campos son opcionales; si se envía `lineas`, se reemplazan completas.
// `motivo` (3-500 chars) queda registrado en auditoría si se provee.
export interface EditarComprobantePayload {
  tipo?: TipoComprobante;
  fechaContable?: string;
  glosa?: string;
  monedaPrincipal?: Moneda;
  lineas?: CrearLineaPayload[];
  motivo?: string;
}

export async function editarComprobante(
  id: string,
  payload: EditarComprobantePayload,
): Promise<Comprobante> {
  const res = await api.patch<Comprobante>(`/api/comprobantes/${id}`, payload);
  return res.data;
}
