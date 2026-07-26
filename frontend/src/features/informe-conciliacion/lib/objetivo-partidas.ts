/**
 * La aritmética que desambigua qué partidas arrastrar al declarar un arranque.
 *
 * A la fecha del arranque vale, por definición de la identidad:
 *
 *     saldoExtracto + Σ partidas abiertas − diferenciaResidual = saldoLibros
 *
 * o sea `Σ partidas = saldoLibros − saldoExtracto + diferenciaResidual`.
 *
 * Eso convierte una pregunta de criterio —¿este asiento de junio es un cheque
 * en circulación o la apertura?— en una cuenta que cierra o no cierra. El
 * sistema no puede decidirla, pero sí puede decir si la selección da.
 *
 * Se opera en CENTAVOS enteros: los montos viajan como string decimal (§4.5) y
 * pasarlos por `number` reintroduce el error IEEE-754 que ese contrato evita.
 */

/** `"-1000.50"` → `-100050`. `null` si no es un decimal con hasta 2 decimales. */
export function aCentavos(monto: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(monto.trim());
  if (match === null) return null;
  const [, signo, enteros, decimales = ''] = match;
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  return signo === '-' ? -centavos : centavos;
}

/** `-100050` → `"-1000.50"`. */
export function deCentavos(centavos: number): string {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Cuánto deberían sumar las partidas confirmadas para que la declaración
 * cierre. `null` si alguno de los tres montos todavía no es un decimal válido
 * — mientras el usuario escribe no se afirma nada.
 */
export function objetivoDePartidas(
  saldoLibros: string,
  saldoExtracto: string,
  diferenciaResidual: string,
): number | null {
  const libros = aCentavos(saldoLibros);
  const extracto = aCentavos(saldoExtracto);
  const residual = aCentavos(diferenciaResidual);
  if (libros === null || extracto === null || residual === null) return null;
  return libros - extracto + residual;
}

/** Suma en centavos de las partidas seleccionadas. */
export function sumaSeleccionada(
  candidatos: readonly { referencia: string; importe: string }[],
  seleccionadas: ReadonlySet<string>,
): number {
  return candidatos
    .filter((c) => seleccionadas.has(c.referencia))
    .reduce((total, c) => total + (aCentavos(c.importe) ?? 0), 0);
}
