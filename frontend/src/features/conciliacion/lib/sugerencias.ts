import type { ConfianzaSugerencia, LineaConciliacion, SugerenciaConciliacion } from '@/types/api';

/**
 * Clave estable de una línea contable dentro del workspace.
 *
 * Las líneas NO tienen `id` propio en la respuesta: su identidad es el ancla
 * `(comprobanteId, orden)` (design §2.1). Se usa como `key` de React —
 * jamás el índice del array (Anti-F-06): las filas se reordenan al confirmar
 * o deshacer un match.
 */
export function claveLinea(comprobanteId: string, orden: number): string {
  return `${comprobanteId}#${orden}`;
}

/** Índice `clave de ancla → línea`, para resolver la contraparte de una sugerencia. */
export function indexarLineas(lineas: LineaConciliacion[]): Map<string, LineaConciliacion> {
  return new Map(lineas.map((l) => [claveLinea(l.comprobanteId, l.orden), l]));
}

// REQ-CB-12: ALTA (monto+fecha exactos, candidato único) manda sobre MEDIA
// (fecha dentro de ±3 días) y MEDIA sobre BAJA (varios candidatos ambiguos).
const PESO_CONFIANZA: Record<ConfianzaSugerencia, number> = {
  ALTA: 0,
  MEDIA: 1,
  BAJA: 2,
};

/**
 * Ordena las sugerencias por confianza y, a igual confianza, por cercanía de
 * fecha. Devuelve una copia: nunca muta el array recibido (CLAUDE.md §2.4).
 */
export function ordenarSugerencias(
  sugerencias: SugerenciaConciliacion[],
): SugerenciaConciliacion[] {
  return [...sugerencias].sort((a, b) => {
    const porConfianza = PESO_CONFIANZA[a.confianza] - PESO_CONFIANZA[b.confianza];
    if (porConfianza !== 0) return porConfianza;
    return a.diferenciaDias - b.diferenciaDias;
  });
}
