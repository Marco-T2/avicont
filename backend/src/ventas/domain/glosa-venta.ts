/**
 * Glosa de CABECERA del comprobante de una venta (Q-2, REQ-VTA-04) — dominio
 * puro. El builder del asiento deliberadamente NO la compone: es
 * responsabilidad del flujo de alta/edición, y DEBE sostenerse sola en el
 * Libro Diario — identifica la operación y el cliente sin abrir la venta.
 * `"Venta #42"` NO cumple.
 */

import type { CondicionPago } from '@prisma/client';

export interface GlosaVentaArgs {
  condicionPago: CondicionPago;
  /** Snapshot del nombre del cliente al momento de vender. */
  razonSocialContacto: string;
  /** Glosa libre de la cabecera de la venta; puede venir vacía. */
  glosaVenta: string;
}

/**
 * La unión va como CLAVE del `Record` para que sumar una condición de pago y
 * olvidarla acá NO compile (mismo movimiento que `NOMBRE_POR_ORIGEN`).
 */
const ETIQUETA_POR_CONDICION: Record<CondicionPago, string> = {
  CONTADO: 'Venta al contado',
  CREDITO: 'Venta a crédito',
};

export function componerGlosaComprobanteVenta(args: GlosaVentaArgs): string {
  const base = `${ETIQUETA_POR_CONDICION[args.condicionPago]} a ${args.razonSocialContacto}`;
  const detalle = args.glosaVenta.trim();
  return detalle.length > 0 ? `${base} — ${detalle}` : base;
}
