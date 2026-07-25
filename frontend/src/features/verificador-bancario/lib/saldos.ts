/**
 * REQ-VMB-10: el saldo vigente responde "cuánto tengo hoy para transferir".
 * Si el último movimiento importado es anterior al corte (`hasta`), el saldo
 * puede estar viejo y la UI DEBE marcarlo — un saldo viejo presentado como
 * saldo de hoy es una respuesta incorrecta.
 *
 * Comparación lexicográfica: `YYYY-MM-DD` ordena igual que el calendario (§4.6,
 * sin `new Date` ni timezone). `null` (cuenta sin movimientos) no marca
 * desactualización: tiene su propio indicador "sin movimientos".
 *
 * Nota: acá NO hay aritmética de dinero. El agregado de saldos por moneda lo
 * calcula el BACKEND (`saldosPorMoneda`, con Money/decimal.js) y el frontend
 * lo presenta sin recalcular — convención anti-recálculo del repo.
 */
export function estaSaldoDesactualizado(
  fechaUltimoMovimiento: string | null,
  hasta: string,
): boolean {
  return fechaUltimoMovimiento !== null && fechaUltimoMovimiento < hasta;
}
