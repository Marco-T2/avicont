import type { CreateVentaRequest, UpdateVentaRequest } from '@/types/api';

import type { VentaFormValues } from '../schemas/venta-form-schema';

/**
 * Mapea los valores del form al payload de POST/PUT.
 *
 * Invariantes que congela mapear-form-a-payload.test.ts:
 * - El payload NUNCA lleva `subtotal` ni `montoTotal` (REQ-VTA-03): los
 *   calcula el backend en cada write; lo que el cliente mande se ignora.
 * - CREDITO → viaja `fechaVencimiento`, se omite `cuentaDestinoId` (la
 *   contrapartida es CxC — el backend la ignoraría, no la mandamos).
 * - CONTADO → viaja `cuentaDestinoId`, se omite `fechaVencimiento` (el
 *   backend la rechaza con VENTA_VENCIMIENTO_REQUERIDO).
 * - Cada línea viaja EXACTAMENTE con {itemId, descripcion, cantidad,
 *   precioUnitario} — cantidad y precio como string (§4.5).
 *
 * `CreateVentaRequest` y `UpdateVentaRequest` son estructuralmente idénticos
 * (edición full-state, D-17): la misma función sirve para ambos verbos.
 */
export function mapearFormAPayload(
  values: VentaFormValues,
): CreateVentaRequest & UpdateVentaRequest {
  const esCredito = values.condicionPago === 'CREDITO';
  return {
    contactoId: values.contactoId,
    fechaContable: values.fechaContable,
    condicionPago: values.condicionPago,
    glosa: values.glosa,
    ...(esCredito ? { fechaVencimiento: values.fechaVencimiento } : {}),
    ...(!esCredito && values.cuentaDestinoId !== ''
      ? { cuentaDestinoId: values.cuentaDestinoId }
      : {}),
    lineas: values.lineas.map((linea) => ({
      itemId: linea.itemId,
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      precioUnitario: linea.precioUnitario,
    })),
  };
}
