import { api } from '@/lib/api';
import type { Comprobante, Moneda, TipoComprobante } from '@/types/api';

export interface CrearLineaPayload {
  cuentaId: string;
  contactoId?: string;
  moneda: Moneda;
  debito: string;
  credito: string;
  tipoCambio: string;
  debitoBob: string;
  creditoBob: string;
  glosaLinea?: string;
}

export interface CrearComprobantePayload {
  tipo: TipoComprobante;
  fechaContable: string;
  glosa: string;
  monedaPrincipal?: Moneda;
  lineas: CrearLineaPayload[];
}

export async function crearComprobante(payload: CrearComprobantePayload): Promise<Comprobante> {
  const res = await api.post<Comprobante>('/api/comprobantes', payload);
  return res.data;
}
