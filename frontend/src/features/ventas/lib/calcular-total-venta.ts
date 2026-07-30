// Preview EN VIVO del total mientras se edita la venta (REQ-VTA-03).
//
// Los totales AUTORITATIVOS los calcula el BACKEND en cada write: este
// cálculo existe solo para que el usuario vea el total mientras tipea y
// NUNCA viaja en el payload (lo congela mapear-form-a-payload.test.ts).
// Una vez que la venta existe, listado y detalle muestran el `montoTotal`
// que devuelve el backend, sin recalcular (§4.5).
//
// Aritmética decimal EXACTA con BigInt — sin Number()/parseFloat (§4.5).
// Espeja la política del backend: `Money.of(cantidad).mul(precio)
// .redondearABob()` = redondeo half-up a 2 decimales POR LÍNEA, y el total
// es la Σ de subtotales YA redondeados (nunca redondear la suma cruda).

const DECIMAL_18_6_REGEX = /^\d{1,12}(\.\d{1,6})?$/;

const ESCALA_SUBTOTAL = 6n + 6n - 2n; // producto en escala 12 → centavos
const DIVISOR_HALF_UP = 10n ** ESCALA_SUBTOTAL;

/** Convierte un string decimal (≤6 decimales) a entero en escala 6, o null si no es válido. */
function aEscala6(valor: string): bigint | null {
  if (!DECIMAL_18_6_REGEX.test(valor)) return null;
  const [entero = '', decimales = ''] = valor.split('.');
  return BigInt(entero + decimales.padEnd(6, '0'));
}

/** Subtotal de una línea en CENTAVOS (escala 2), redondeado half-up. */
function subtotalEnCentavos(cantidad: string, precioUnitario: string): bigint | null {
  const c = aEscala6(cantidad);
  const p = aEscala6(precioUnitario);
  if (c === null || p === null) return null;
  const producto = c * p; // escala 12, siempre ≥ 0 (el regex no admite signo)
  const cociente = producto / DIVISOR_HALF_UP;
  const resto = producto % DIVISOR_HALF_UP;
  // Half-up: .5 exacto sube — la política única de la casa (Anti-04),
  // NO half-even. 5 × 6.305 = 31.525 → "31.53" (half-even daría "31.52").
  return resto * 2n >= DIVISOR_HALF_UP ? cociente + 1n : cociente;
}

function formatearCentavos(centavos: bigint): string {
  const s = centavos.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/**
 * Subtotal de una línea como string "NN.NN", o null si cantidad/precio
 * todavía no son decimales válidos (el usuario está tipeando).
 */
export function calcularSubtotalPreview(
  cantidad: string,
  precioUnitario: string,
): string | null {
  const centavos = subtotalEnCentavos(cantidad, precioUnitario);
  return centavos === null ? null : formatearCentavos(centavos);
}

/**
 * Total preview de la venta: Σ de subtotales ya redondeados (REQ-VTA-03).
 * Las líneas inválidas/incompletas se excluyen de la suma.
 */
export function calcularTotalPreview(
  lineas: ReadonlyArray<{ cantidad: string; precioUnitario: string }>,
): string {
  const total = lineas.reduce((acc, linea) => {
    const centavos = subtotalEnCentavos(linea.cantidad, linea.precioUnitario);
    return centavos === null ? acc : acc + centavos;
  }, 0n);
  return formatearCentavos(total);
}
