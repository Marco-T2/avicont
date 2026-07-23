/**
 * Normaliza la descripción de un movimiento bancario para que sea estable
 * entre descargas del mismo banco — entra al `hashDedup` (REQ-CB-07, design
 * §6.2). También se reusa para normalizar etiquetas de cabecera al mapear
 * columnas por nombre (design §8.3, §4.3.1 — la etiqueta `'Monto\n'` de
 * Unión matchea gracias a este mismo colapso de saltos).
 *
 * Pasos, en orden (cada uno responde a variación observada entre exports):
 *   1. Unicode NFKC — ligaduras / formas de ancho completo según el generador.
 *   2. Quitar diacríticos (NFD + eliminar marcas combinantes) — DEPÓSITO vs
 *      DEPOSITO entre modos de export (#953).
 *   3. toUpperCase() — bancos alternan capitalización entre XLSX y MT940.
 *   4. NBSP/tabs/saltos → espacio; colapsar runs; trim() — XLSX inyecta NBSP.
 *   5. Truncar a 200 chars — cota superior estable.
 *
 * Deliberadamente NO se quitan dígitos, números de referencia ni puntuación:
 * eso es justamente lo que distingue dos transferencias del mismo monto el
 * mismo día. Las colisiones legítimas ya las resuelve `ordinalDia`.
 */
const MAX_LENGTH = 200;

export function normalizarDescripcion(raw: string): string {
  const nfkc = raw.normalize('NFKC');
  const sinDiacriticos = nfkc.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const mayusculas = sinDiacriticos.toUpperCase();
  const espaciosColapsados = mayusculas.replace(/\s+/g, ' ').trim();
  return espaciosColapsados.slice(0, MAX_LENGTH);
}
