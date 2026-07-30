// §4.5: los decimales del backend llegan como STRING y acá NO se convierten a
// number en ningún momento — el formateo es manipulación de texto pura.
//
// Por qué no se reusa `formatearMontoBob`: ese helper fuerza 2 decimales, y
// `precioUnitarioSugerido` es Decimal(18,6). Pasarlo por ahí mostraría "18,51"
// donde el valor guardado es 18.505 — un redondeo VISUAL que el sistema nunca
// hizo, sobre la cifra que el usuario usa para cotizar. Acá se preservan todos
// los decimales tal como vinieron, y solo se agrupan los miles.

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

/**
 * Formatea un decimal string para mostrarlo en es-BO conservando la precisión
 * exacta que mandó el backend.
 *
 * `'18.505'` → `'18,505'` · `'1234.5'` → `'1.234,5'` · `'25'` → `'25'`
 *
 * Si el string no tiene forma de decimal, se devuelve intacto: mostrar el dato
 * crudo es preferible a mostrar uno transformado a medias.
 */
export function formatearDecimalDisplay(valor: string): string {
  if (!DECIMAL_REGEX.test(valor)) return valor;

  const negativo = valor.startsWith('-');
  const sinSigno = negativo ? valor.slice(1) : valor;
  const [entera = '', decimales] = sinSigno.split('.');

  const enteraAgrupada = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cuerpo = decimales !== undefined ? `${enteraAgrupada},${decimales}` : enteraAgrupada;

  return negativo ? `-${cuerpo}` : cuerpo;
}
