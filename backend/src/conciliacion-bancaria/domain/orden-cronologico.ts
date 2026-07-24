/**
 * Orden CRONOLÓGICO de los movimientos de un extracto, derivado del orden
 * FÍSICO de las filas del archivo. Es una pregunta distinta de la que
 * responde `ordenarCanonico` y por eso vive aparte:
 *
 * - `ordenarCanonico` (hash de dedup, `asignarOrdinalDia`) ordena por
 *   atributos INTRÍNSECOS del dato (`fecha → monto → tipo → …`) y **descarta
 *   la posición física a propósito**: es lo que garantiza que el mismo
 *   movimiento produzca el mismo hash venga el archivo en ASC o en DESC.
 * - El checksum DERIVADO, en cambio, necesita saber cuál movimiento ocurrió
 *   PRIMERO y cuál ÚLTIMO, porque reconstruye el saldo inicial a partir del
 *   saldo corrido de uno de los extremos.
 *
 * Reusar el orden canónico para el checksum es un bug real y silencioso: si
 * el día más antiguo tiene varios movimientos, el "primero" del orden
 * canónico es el de MENOR MONTO de ese día, no el cronológicamente primero, y
 * el ancla del saldo queda mal. Caso verificado: el export "Últimos 30
 * movimientos" de Fortaleza abre el 24/06 con tres créditos
 * (17:36 → Bs 45.000, 17:37 → Bs 50.000, 17:38 → Bs 41.000). El orden
 * canónico ancla en el de Bs 41.000 y reporta un DESCUADRE de Bs 95.000
 * (= 45.000 + 50.000) sobre datos que están perfectos. Los otros perfiles
 * DERIVADO venían salvándose por casualidad estructural: su día más antiguo
 * tenía un solo movimiento, o el de menor monto resultaba ser el primero
 * (BMSC abre su día con un débito de Bs 1,00).
 *
 * **La fila física es la fuente correcta**: los bancos emiten el extracto
 * ordenado por tiempo real, incluso dentro de un mismo día y aunque el
 * formato no publique la hora (Unión). Lo único que varía es la dirección, y
 * eso se detecta comparando las fechas.
 *
 * Si la secuencia física NO es monótona, este módulo NO adivina: devuelve
 * `null` y el checksum queda `SIN_VERIFICAR`. Un "no pude verificar" honesto
 * es preferible a un descuadre inventado — la señal de descuadre solo sirve
 * si el contador puede confiar en ella.
 */
import type { MovimientoParseado } from '../ports/extracto-parser.port';

export type DireccionFisica = 'ASC' | 'DESC' | 'NO_MONOTONA';

/**
 * Dirección temporal de las filas TAL COMO VIENEN en el archivo. Se evalúa a
 * nivel de DÍA (no de hora): es la única granularidad que todos los perfiles
 * publican. Un archivo con todas las filas del mismo día es no-decreciente y
 * no-creciente a la vez — se resuelve como `ASC`, que deja el orden físico
 * intacto, que es justamente lo que se quiere.
 */
export function detectarDireccionFisica(
  movimientosEnOrdenFisico: readonly MovimientoParseado[],
): DireccionFisica {
  let noDecreciente = true;
  let noCreciente = true;

  for (let i = 1; i < movimientosEnOrdenFisico.length; i++) {
    const previo = movimientosEnOrdenFisico[i - 1]!.fecha;
    const actual = movimientosEnOrdenFisico[i]!.fecha;
    if (actual.isBefore(previo)) noDecreciente = false;
    if (actual.isAfter(previo)) noCreciente = false;
  }

  if (noDecreciente) return 'ASC';
  if (noCreciente) return 'DESC';
  return 'NO_MONOTONA';
}

/**
 * Devuelve los movimientos en orden cronológico ascendente (más antiguo
 * primero), o `null` si el archivo no viene ordenado por fecha y por lo tanto
 * no se puede saber cuál ocurrió primero.
 *
 * NO ordena por fecha con `sort`: eso volvería a perder el desempate dentro
 * del día, que es exactamente el problema que este módulo resuelve. Solo
 * conserva o invierte el orden físico en bloque.
 */
export function ordenarCronologico(
  movimientosEnOrdenFisico: readonly MovimientoParseado[],
): MovimientoParseado[] | null {
  const direccion = detectarDireccionFisica(movimientosEnOrdenFisico);
  if (direccion === 'NO_MONOTONA') return null;
  return direccion === 'ASC'
    ? [...movimientosEnOrdenFisico]
    : [...movimientosEnOrdenFisico].reverse();
}
