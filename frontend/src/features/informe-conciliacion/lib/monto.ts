// CLAUDE.md §4.5: los montos viajan como string decimal. El parseo es SOLO
// para decidir presentación (¿destaco el residuo?), nunca para aritmética.

/**
 * `true` si el monto string representa exactamente cero.
 *
 * Un residuo de un centavo NO es cero: el papel de trabajo lo destaca en vez
 * de redondearlo (REQ-ICB-06). Un string no numérico tampoco se trata como
 * cero — ante un dato inesperado se prefiere mostrarlo a esconderlo.
 */
export function esMontoCero(monto: string): boolean {
  const num = Number(monto);
  return Number.isFinite(num) && num === 0;
}
