/**
 * Glosa de CABECERA del comprobante de un cobro (Q-2, REQ-CXC-02) — dominio
 * puro. El builder del asiento deliberadamente NO la compone: es
 * responsabilidad del flujo de alta/edición, y DEBE sostenerse sola en el
 * Libro Diario — identifica la operación y el cliente sin abrir el cobro.
 * `"Cobro #42"` NO cumple. Molde: `ventas/domain/glosa-venta.ts`.
 */

export interface GlosaCobroArgs {
  /** Snapshot del nombre del cliente al momento de cobrar. */
  razonSocialContacto: string;
  /** Glosa libre de la cabecera del cobro; puede venir vacía. */
  glosaCobro: string;
}

export function componerGlosaComprobanteCobro(args: GlosaCobroArgs): string {
  const base = `Cobro a ${args.razonSocialContacto}`;
  const detalle = args.glosaCobro.trim();
  return detalle.length > 0 ? `${base} — ${detalle}` : base;
}
