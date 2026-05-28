import { api } from '@/lib/api';
import type { Comprobante, TipoComprobante } from '@/types/api';

import type { CrearLineaPayload } from './crear-comprobante';

// PATCH /api/comprobantes/:id — sirve para BORRADOR y CONTABILIZADO.
// Todos los campos son opcionales; si se envía `lineas`, se reemplazan completas.
// `motivo` (3-500 chars) queda registrado en auditoría si se provee.
// monedaPrincipal omitida — el backend lockea a BOB; la UI no expone ese campo.
export interface EditarComprobantePayload {
  tipo?: TipoComprobante;
  fechaContable?: string;
  glosa?: string;
  // T/C de re-expresión: solo presentación; no afecta la contabilidad.
  tipoCambioReexpresion?: string;
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
