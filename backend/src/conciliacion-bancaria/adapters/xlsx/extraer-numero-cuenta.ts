/**
 * Extrae y limpia el número de cuenta declarado en la cabecera de un XLSX
 * (design §4.3, REQ-CB-16). El strip de prefijo/sufijo es dato del dialecto
 * — si el prefijo/sufijo esperado no aparece, es error de formato del
 * archivo, NUNCA un strip silencioso (regla 2 del design).
 *
 * Devuelve el valor YA limpio (solo separadores quedan por normalizar, y
 * eso lo hace el VO `NumeroCuentaBancaria`, no esta función). `null` cuando
 * la etiqueta no aparece en el bloque de cabecera.
 */
import { ArchivoFormatoNoReconocidoError } from '../../domain/importacion-errors';
import type { ExtraccionNumeroCuenta } from '../dialectos/dialecto-xlsx';
import { buscarValorDeEtiqueta } from './escaneo-cabecera';
import type { MatrizXlsx } from './leer-matriz-xlsx';

export function extraerNumeroCuenta(
  matriz: MatrizXlsx,
  extraccion: ExtraccionNumeroCuenta,
  filasMax: number,
): string | null {
  const valor = buscarValorDeEtiqueta(matriz, extraccion.etiqueta, filasMax);
  if (valor === null || typeof valor !== 'string') return null;

  let limpio = valor.trim();

  if (extraccion.prefijoProducto !== undefined) {
    if (!limpio.startsWith(extraccion.prefijoProducto)) {
      throw new ArchivoFormatoNoReconocidoError(
        `se esperaba que el número de cuenta empezara con "${extraccion.prefijoProducto}"`,
      );
    }
    limpio = limpio.slice(extraccion.prefijoProducto.length).trim();
  }

  if (extraccion.sufijoMoneda !== undefined) {
    if (!limpio.endsWith(extraccion.sufijoMoneda)) {
      throw new ArchivoFormatoNoReconocidoError(
        `se esperaba que el número de cuenta terminara con "${extraccion.sufijoMoneda}"`,
      );
    }
    limpio = limpio.slice(0, limpio.length - extraccion.sufijoMoneda.length).trim();
  }

  return limpio.length > 0 ? limpio : null;
}
