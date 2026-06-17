import type { EstadoComprobante } from '@/types/api';

export type EstadoCierrePantalla =
  | 'SIN_CIERRES'
  | 'EN_BORRADOR'
  | 'PARCIALMENTE_CONTABILIZADO'
  | 'TODOS_CONTABILIZADO';

/**
 * Deriva el estado de la pantalla de cierre desde la lista de comprobantes de cierre.
 * Función pura sin efectos. Se llama en cada render (Anti-F-02: no useEffect + useState).
 */
export function derivarEstadoCierre(
  cierres: { estado: EstadoComprobante }[],
): EstadoCierrePantalla {
  if (cierres.length === 0) return 'SIN_CIERRES';
  const contabilizados = cierres.filter((c) => c.estado === 'CONTABILIZADO').length;
  if (contabilizados === 0) return 'EN_BORRADOR';
  if (contabilizados === cierres.length) return 'TODOS_CONTABILIZADO';
  return 'PARCIALMENTE_CONTABILIZADO';
}
