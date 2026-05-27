// Tolerancia de partida doble en BOB (CLAUDE.md §4.1).
const TOLERANCIA_BOB = 0.01;

/**
 * Determina si los totales de débito y crédito en BOB están balanceados.
 * Tolerancia: ±Bs 0.01 para redondeo (CLAUDE.md §4.1).
 */
export function estaBalanceado(totalDebitoBob: number, totalCreditoBob: number): boolean {
  return Math.abs(totalDebitoBob - totalCreditoBob) <= TOLERANCIA_BOB;
}

/**
 * Retorna la diferencia absoluta entre débitos y créditos en BOB,
 * redondeada a 2 decimales, como string para display.
 * Útil para el mensaje de error de partida doble desbalanceada.
 */
export function calcularDiffBob(totalDebitoBob: number, totalCreditoBob: number): string {
  return Math.abs(totalDebitoBob - totalCreditoBob).toFixed(2);
}
