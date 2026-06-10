import { api } from '@/lib/api';
import type { AdjuntoComprobante } from '@/types/api';

/**
 * GET /api/comprobantes/:id/adjuntos
 * Devuelve la lista de adjuntos del comprobante. Requiere pack contabilidad.adjuntos.
 */
export async function getAdjuntos(comprobanteId: string): Promise<AdjuntoComprobante[]> {
  const res = await api.get<AdjuntoComprobante[]>(
    `/api/comprobantes/${comprobanteId}/adjuntos`,
  );
  return res.data;
}

/**
 * POST /api/comprobantes/:id/adjuntos
 * Sube un archivo como adjunto. Requiere asientos.update + pack.
 */
export async function subirAdjunto(
  comprobanteId: string,
  file: File,
): Promise<AdjuntoComprobante> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await api.post<AdjuntoComprobante>(
    `/api/comprobantes/${comprobanteId}/adjuntos`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data;
}

/**
 * GET /api/comprobantes/:id/adjuntos/:adjuntoId/download
 * Descarga el adjunto como Blob. Requiere asientos.read + pack.
 */
export async function descargarAdjunto(
  comprobanteId: string,
  adjuntoId: string,
): Promise<Blob> {
  const res = await api.get<Blob>(
    `/api/comprobantes/${comprobanteId}/adjuntos/${adjuntoId}/download`,
    { responseType: 'blob' },
  );
  return res.data;
}

/**
 * PUT /api/comprobantes/:id/adjuntos/:adjuntoId
 * Reemplaza el archivo de un adjunto existente. Requiere asientos.update + pack.
 */
export async function reemplazarAdjunto(
  comprobanteId: string,
  adjuntoId: string,
  file: File,
): Promise<AdjuntoComprobante> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await api.put<AdjuntoComprobante>(
    `/api/comprobantes/${comprobanteId}/adjuntos/${adjuntoId}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data;
}

/**
 * DELETE /api/comprobantes/:id/adjuntos/:adjuntoId
 * Elimina el adjunto (metadata + storage). Requiere asientos.update + pack.
 */
export async function eliminarAdjunto(
  comprobanteId: string,
  adjuntoId: string,
): Promise<void> {
  await api.delete(`/api/comprobantes/${comprobanteId}/adjuntos/${adjuntoId}`);
}
