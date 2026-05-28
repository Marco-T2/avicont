import { z } from 'zod';

// Tolerancia de partida doble en BOB (CLAUDE.md §4.1).
export const TOLERANCIA_BOB = 0.01;

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

/**
 * Refinement de Zod compartido entre crear-comprobante-schema y editar-comprobante-schema.
 * Valida partida doble en BOB con tolerancia ±Bs 0.01 (CLAUDE.md §4.1).
 * Si hay <2 líneas, no valida (1 línea es válida para guardar borrador).
 */
export function superRefinePartidaDoble(
  lineas: ReadonlyArray<{ debitoBob: string; creditoBob: string }>,
  ctx: z.RefinementCtx,
): void {
  if (lineas.length < 2) return;

  let totalDebitoBob = 0;
  let totalCreditoBob = 0;

  for (const linea of lineas) {
    const deb = parseFloat(linea.debitoBob);
    const cred = parseFloat(linea.creditoBob);
    totalDebitoBob += isFinite(deb) ? deb : 0;
    totalCreditoBob += isFinite(cred) ? cred : 0;
  }

  const diff = Math.abs(totalDebitoBob - totalCreditoBob);
  if (diff > TOLERANCIA_BOB) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Los débitos no igualan a los créditos en BOB (diferencia: Bs ${diff.toFixed(2)})`,
      path: ['lineas'],
    });
  }
}
