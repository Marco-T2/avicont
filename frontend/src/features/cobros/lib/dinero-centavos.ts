// CLAUDE.md §4.5: los montos viajan como strings Decimal(18,2) y el frontend
// NO tiene librería decimal. Toda la aritmética del reparto FIFO se hace en
// CENTAVOS como enteros BigInt — un Decimal(18,2) admite hasta 16 dígitos
// enteros y ya en centavos supera Number.MAX_SAFE_INTEGER, así que ni siquiera
// un entero `number` alcanza. PROHIBIDO parseFloat/Number para repartir plata.

const MONTO_REGEX = /^\d{1,16}(\.\d{1,2})?$/;

/**
 * Convierte un monto string Decimal(18,2) a centavos enteros.
 * Acepta "1250", "1250.5" y "1250.50" (0, 1 o 2 decimales).
 * @throws Error si el string no es un monto válido (signo, letras, >2 decimales).
 */
export function aCentavos(monto: string): bigint {
  if (!MONTO_REGEX.test(monto)) {
    throw new Error(`Monto inválido para convertir a centavos: "${monto}"`);
  }
  const [entero = '0', decimales = ''] = monto.split('.');
  return BigInt(entero) * 100n + BigInt(decimales.padEnd(2, '0'));
}

/**
 * Variante que no lanza: devuelve null ante un string inválido.
 * Para inputs del usuario a medio tipear ("", "12.", "abc").
 */
export function aCentavosSeguro(monto: string): bigint | null {
  return MONTO_REGEX.test(monto) ? aCentavos(monto) : null;
}

/**
 * Convierte centavos enteros de vuelta a string decimal con 2 decimales
 * canónicos ("300" centavos → "3.00").
 * @throws Error si los centavos son negativos (un monto nunca lo es).
 */
export function deCentavos(centavos: bigint): string {
  if (centavos < 0n) {
    throw new Error(`Centavos negativos no representan un monto: ${centavos}`);
  }
  const entero = centavos / 100n;
  const dec = centavos % 100n;
  return `${entero}.${dec.toString().padStart(2, '0')}`;
}
