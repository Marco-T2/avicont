import { calcularMontoBob } from './calcular-monto-bob';

// Tolerancia de partida doble en BOB (CLAUDE.md §4.1).
const TOLERANCIA_BOB = 0.01;

export interface TotalesLineas {
  totalDebitoBob: number;
  totalCreditoBob: number;
  estaBalanceado: boolean;
}

interface LineaMontos {
  debito: string;
  credito: string;
  tipoCambio: string;
}

/**
 * Suma los `debito`/`credito` convertidos a BOB (vía `tipoCambio`) del array
 * de líneas y determina si la partida doble está balanceada (tolerancia
 * ±Bs 0.01 — CLAUDE.md §4.1).
 *
 * Los valores llegan como strings desde el form (CLAUDE.md §4.5).
 * Strings vacíos o no numéricos se tratan como 0.
 *
 * Los BOB son derived state: NO se trackean en el form para evitar re-mount
 * del input por regeneración de field.id del useFieldArray (Anti-F-02).
 */
export function calcularTotalesLineas(lineas: LineaMontos[]): TotalesLineas {
  let totalDebitoBob = 0;
  let totalCreditoBob = 0;

  for (const linea of lineas) {
    const deb = parseFloat(calcularMontoBob(linea.debito, linea.tipoCambio));
    const cred = parseFloat(calcularMontoBob(linea.credito, linea.tipoCambio));
    totalDebitoBob += isFinite(deb) ? deb : 0;
    totalCreditoBob += isFinite(cred) ? cred : 0;
  }

  const diff = Math.abs(totalDebitoBob - totalCreditoBob);
  const estaBalanceado = diff <= TOLERANCIA_BOB;

  return { totalDebitoBob, totalCreditoBob, estaBalanceado };
}
