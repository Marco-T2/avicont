import { hoyEnLaPazISO } from '@/lib/fecha-actual';

/**
 * REQ-VMB-10: el saldo vigente responde "cuánto tengo hoy para transferir", así
 * que un saldo viejo presentado como saldo de hoy es una respuesta incorrecta y
 * la UI DEBE marcarlo.
 *
 * La versión anterior marcaba con `fechaUltimoMovimiento < hasta` a secas, y eso
 * encendía la marca en TODAS las cuentas casi siempre: basta que el corte del
 * rango no coincida con el día exacto del último movimiento. Con 3 cuentas
 * marcadas de 3, la señal no informa nada — un indicador que está siempre
 * encendido es decoración, no advertencia. Dos correcciones:
 *
 * 1. **El corte se acota a hoy.** Un rango que termina en el futuro (o el
 *    year-to-date por default, que llega a fin de mes) no puede exigir
 *    movimientos que todavía no ocurrieron.
 * 2. **Tolerancia en días.** Una cuenta bancaria pasa días sin movimiento con
 *    total normalidad; "no hubo movimiento ayer" no es un saldo viejo. Lo que
 *    sí importa es un atraso que sugiere extractos sin importar.
 *
 * Comparación calendario pura (§4.6): `YYYY-MM-DD` ordena lexicográficamente
 * igual que el calendario, y la resta de días usa `Date.UTC` sobre las partes
 * ya parseadas — función determinística de (año, mes, día), sin leer el reloj
 * ni depender del timezone del browser. El "hoy" entra por `hoyEnLaPazISO`,
 * inyectable en tests.
 *
 * Nota: acá NO hay aritmética de dinero. El agregado de saldos por moneda lo
 * calcula el BACKEND (`saldosPorMoneda`, con Money/decimal.js) y el frontend
 * lo presenta sin recalcular — convención anti-recálculo del repo.
 */

/**
 * Días de atraso tolerados antes de marcar el saldo como desactualizado.
 * Una semana = "no importaste extractos de esta cuenta en la última semana",
 * que es la lectura accionable para el contador.
 */
export const DIAS_TOLERANCIA_SALDO = 7;

// Días calendario entre dos fechas ISO. Ambas se ancoran a medianoche UTC, así
// que la resta da días exactos: UTC no tiene DST y el offset se cancela.
function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = hasta.split('-').map(Number) as [number, number, number];
  const MS_POR_DIA = 86_400_000;
  return (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_POR_DIA;
}

/**
 * Días de atraso del saldo respecto del corte efectivo (`min(hasta, hoy)`).
 *
 * `0` = vigente (hay movimiento en el corte o después). Nunca negativo: un
 * movimiento posterior al corte no adelanta el saldo, lo deja vigente.
 * `null` (cuenta sin movimientos) devuelve `0`: tiene su propio indicador.
 */
export function diasDeAtrasoDelSaldo(
  fechaUltimoMovimiento: string | null,
  hasta: string,
  hoy: string = hoyEnLaPazISO(),
): number {
  if (fechaUltimoMovimiento === null) return 0;
  const corteEfectivo = hasta < hoy ? hasta : hoy;
  if (fechaUltimoMovimiento >= corteEfectivo) return 0;
  return diasEntre(fechaUltimoMovimiento, corteEfectivo);
}

/**
 * `true` cuando el saldo está atrasado más de `DIAS_TOLERANCIA_SALDO` respecto
 * del corte efectivo. Ver el comentario del módulo para el por qué de cada
 * regla.
 */
export function estaSaldoDesactualizado(
  fechaUltimoMovimiento: string | null,
  hasta: string,
  hoy: string = hoyEnLaPazISO(),
): boolean {
  return diasDeAtrasoDelSaldo(fechaUltimoMovimiento, hasta, hoy) > DIAS_TOLERANCIA_SALDO;
}
