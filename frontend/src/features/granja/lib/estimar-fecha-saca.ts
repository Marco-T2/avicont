// CLAUDE.md §4.6: la fecha estimada de saca es calendario puro (YYYY-MM-DD).
// Calculamos en UTC para que sumar días no cruce de día por el offset local;
// no leemos el reloj (new Date(numero) es determinístico), así que no aplica
// la prohibición de new Date() del dominio.

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 86_400_000;

/**
 * Estima la fecha de saca sumando `dias` de engorde a la fecha de ingreso.
 *
 * @param fechaIngreso fecha 'YYYY-MM-DD' de ingreso del lote.
 * @param dias días de engorde a sumar.
 * @returns fecha 'YYYY-MM-DD', o '' si los argumentos son inválidos.
 */
export function estimarFechaSaca(fechaIngreso: string, dias: number): string {
  const match = FECHA_ISO.exec(fechaIngreso);
  if (match === null || !Number.isFinite(dias)) return '';

  const [, year, month, day] = match;
  const base = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const resultado = new Date(base + dias * MS_POR_DIA);

  const yyyy = resultado.getUTCFullYear();
  const mm = String(resultado.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(resultado.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
