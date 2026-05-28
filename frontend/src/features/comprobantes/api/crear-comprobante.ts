import { api } from '@/lib/api';
import type { Comprobante, TipoComprobante } from '@/types/api';

export interface CrearLineaPayload {
  cuentaId: string;
  contactoId?: string;
  // moneda y tipoCambio son siempre BOB/1 — la UI no expone selector de moneda.
  moneda: 'BOB';
  debito: string;
  credito: string;
  tipoCambio: '1';
  debitoBob: string;
  creditoBob: string;
  glosaLinea?: string;
}

export interface CrearComprobantePayload {
  tipo: TipoComprobante;
  fechaContable: string;
  glosa: string;
  // monedaPrincipal siempre BOB — el backend lockea a BOB; no se elige en UI.
  monedaPrincipal: 'BOB';
  // T/C de re-expresión: solo presentación; no afecta la contabilidad.
  tipoCambioReexpresion?: string;
  lineas: CrearLineaPayload[];
}

export async function crearComprobante(payload: CrearComprobantePayload): Promise<Comprobante> {
  const res = await api.post<Comprobante>('/api/comprobantes', payload);
  return res.data;
}
