import writeXlsxFile from 'write-excel-file/browser';

import { parsearMontoCelda } from './formato-celda';

/**
 * Celda numérica: el value es un string decimal del backend.
 * El boundary string→Number ocurre AQUÍ (§4.5). Nunca para aritmética.
 */
export interface CeldaNumero {
  type: 'numero';
  value: string;
}

/**
 * Celda de texto: value se escribe tal cual.
 */
export interface CeldaTexto {
  type: 'texto';
  value: string;
}

export type Celda = CeldaNumero | CeldaTexto;

/**
 * Convierte la matriz de celdas tipadas a un Blob .xlsx.
 *
 * - CeldaNumero → { type: Number, value: <parseFloat>, format: '#,##0.00' }
 * - CeldaTexto  → { type: String, value: string }
 *
 * El builder NO realiza aritmética. Los valores de cada celda se escriben
 * tal cual del input (§4.5 Anti-recálculo).
 */
export async function construirHoja(filas: Celda[][]): Promise<Blob> {
  const datos = filas.map((fila) =>
    fila.map((celda) => {
      if (celda.type === 'numero') {
        return {
          type: Number,
          value: parsearMontoCelda(celda.value),
          format: '#,##0.00',
        };
      }
      return {
        type: String,
        value: celda.value,
      };
    }),
  );

  const resultado = await writeXlsxFile(datos, {
    columns: [
      { width: 14 }, // Fecha
      { width: 12 }, // Código
      { width: 35 }, // Cuenta
      { width: 40 }, // Glosa
      { width: 16 }, // Debe (BOB)
      { width: 16 }, // Haber (BOB)
      { width: 10 }, // Estado
    ],
  });

  return resultado.toBlob();
}
