/**
 * Helpers de formato para celdas del PDF.
 *
 * §4.5 Money: a diferencia del Excel (que delega el formato al motor de la hoja),
 * en el PDF no hay engine de formato — el monto string se renderiza como texto.
 * Esta función produce la representación es-BO (miles con ".", decimales con ",")
 * mediante manipulación de string PURA, sin Intl/locale ni aritmética de negocio.
 * Es determinística e independiente del entorno (mismo espíritu que
 * `formatearFechaCelda` para §4.6).
 */

/**
 * Formatea un monto decimal string a notación es-BO para presentación.
 *
 * Ejemplos: "5000.00" → "5.000,00", "1234567.89" → "1.234.567,89", "-1500.00" → "-1.500,00".
 * Ante un string no numérico devuelve "0,00" (nunca NaN en el informe).
 */
export function formatearMontoPdf(monto: string): string {
  const limpio = monto.trim();
  // Validación (no aritmética de negocio): un valor no numérico no debe ensuciar el informe.
  if (limpio === '' || Number.isNaN(Number(limpio))) {
    return '0,00';
  }

  const negativo = limpio.startsWith('-');
  const sinSigno = negativo ? limpio.slice(1) : limpio;
  const [enteroRaw = '0', decimalRaw = ''] = sinSigno.split('.');

  const entero = enteroRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimal = `${decimalRaw}00`.slice(0, 2);

  return `${negativo ? '-' : ''}${entero},${decimal}`;
}
