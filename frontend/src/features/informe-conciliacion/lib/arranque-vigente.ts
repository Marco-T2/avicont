import type { ArranqueAplicado } from '@/types/api';

/**
 * Id de la declaración de arranque que APLICA a un corte (REQ-ICB-04, D8).
 *
 * El historial llega del backend con el MISMO desempate que `vigenteA`
 * (`fecha DESC, createdAt DESC`), así que la vigente es la PRIMERA fila con
 * `fecha <= corte` — esta función confía en ese orden y NO re-ordena ni
 * reimplementa `vigenteA`.
 *
 * Fechas contables `YYYY-MM-DD` (§4.6): la comparación lexicográfica de
 * strings ES la comparación cronológica — sin `Date`, sin zona horaria.
 */
export function idArranqueVigente(historial: ArranqueAplicado[], corte: string): string | null {
  const vigente = historial.find((a) => a.fecha <= corte);
  return vigente?.id ?? null;
}
