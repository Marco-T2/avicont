/**
 * Única puerta por la que una celda de extracto se convierte en dinero
 * (design §8.0/§8.1). `read-excel-file` se configura con
 * `{ parseNumber: (s) => s }` — cada celda llega como string y NUNCA se
 * convierte con `Number()`: toda coerción vive acá, vía `Money.of` sobre el
 * string ya limpiado (CLAUDE.md §4.5).
 *
 * El dialecto decimal (`1,234.56` vs `1.234,56`) es un flag EXPLÍCITO del
 * `DialectoMonto`, jamás inferido por sniffing: un extracto con un solo
 * movimiento de `1.500` es ambiguo y el sniffing acertaría el 50% de las
 * veces. Errar acá es un error de 1000x.
 */
import type { LadoBancario } from '@prisma/client';

import { Money } from '@/common/domain/money';

export interface DialectoMonto {
  readonly separadorMiles: ',' | '.';
  readonly separadorDecimal: '.' | ',';
}

export interface MontoLeido {
  /** SIEMPRE positivo — el signo original se traduce a `tipo`. */
  readonly monto: Money;
  /** Perspectiva del BANCO. `-` → DEBITO; `+`/sin signo → CREDITO. */
  readonly tipo: LadoBancario;
}

// "Bs.", "USD", "$us." — prefijo de moneda que algunos bancos (Fortaleza)
// anteponen al monto.
const PREFIJO_MONEDA_REGEX = /^(Bs\.?|USD|\$us\.?)\s*/i;

export function leerMontoCelda(raw: string, dialecto: DialectoMonto): MontoLeido {
  let s = raw.trim();
  if (s.length === 0) {
    throw new RangeError('leerMontoCelda: celda vacía');
  }

  s = s.replace(PREFIJO_MONEDA_REGEX, '').trim();

  const negativo = s.startsWith('-');
  if (negativo || s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  // Quitar separador de miles PRIMERO, luego normalizar el separador
  // decimal a '.' — el orden importa para no confundir uno con otro.
  s = s.split(dialecto.separadorMiles).join('');
  if (dialecto.separadorDecimal === ',') {
    s = s.replace(',', '.');
  }

  const monto = Money.of(s).abs();
  const tipo: LadoBancario = negativo ? 'DEBITO' : 'CREDITO';
  return { monto, tipo };
}
