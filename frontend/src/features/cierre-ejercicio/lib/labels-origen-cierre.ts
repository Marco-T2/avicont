// Mapa de origenTipo a label en español para los comprobantes de cierre.
// origenTipo es uno de 3 slots definidos por el backend (CLAUDE.md §4.9).
const LABELS: Record<string, string> = {
  CIERRE_GASTOS: 'Cierre de gastos y costos',
  CIERRE_INGRESOS: 'Cierre de ingresos',
  CIERRE_RESULTADO: 'Traslado del resultado',
};

/**
 * Devuelve el label en español para el origenTipo del comprobante de cierre.
 * Fallback: devuelve el string original para valores desconocidos, nunca lanza.
 */
export function labelOrigenCierre(origenTipo: string): string {
  return LABELS[origenTipo] ?? origenTipo;
}
