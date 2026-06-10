import writeXlsxFile from 'write-excel-file/browser';

import { parsearMontoCelda } from './formato-celda';

/**
 * Props de estilo compartidas entre CeldaNumero y CeldaTexto.
 * Opcionales: sin estilo explícito el output es byte-idéntico al anterior.
 */
export interface CeldaEstilo {
  fontWeight?: 'bold';
  align?: 'left' | 'center' | 'right';
}

/**
 * Celda numérica: el value es un string decimal del backend.
 * El boundary string→Number ocurre AQUÍ (§4.5). Nunca para aritmética.
 * `align` default 'right' en construirHoja (montos siempre a la derecha).
 */
export interface CeldaNumero extends CeldaEstilo {
  type: 'numero';
  value: string;
}

/**
 * Celda de texto: value se escribe tal cual.
 */
export interface CeldaTexto extends CeldaEstilo {
  type: 'texto';
  value: string;
}

export type Celda = CeldaNumero | CeldaTexto;

/** Configuración de ancho de columna para la hoja Excel. */
export interface ColumnaHoja {
  width: number;
}

/**
 * Columnas por defecto del Libro Diario (Fase A).
 * Parametrizar `construirHoja` con `columns` para otros informes (Fase B).
 */
const COLUMNS_LIBRO_DIARIO: ColumnaHoja[] = [
  { width: 14 }, // Fecha
  { width: 12 }, // Código
  { width: 35 }, // Cuenta
  { width: 40 }, // Glosa
  { width: 16 }, // Debe (BOB)
  { width: 16 }, // Haber (BOB)
  { width: 10 }, // Estado
];

/**
 * Convierte la matriz de celdas tipadas a un Blob .xlsx.
 *
 * - CeldaNumero → { type: Number, value: <parseFloat>, format: '#,##0.00' }
 * - CeldaTexto  → { type: String, value: string }
 *
 * El builder NO realiza aritmética. Los valores de cada celda se escriben
 * tal cual del input (§4.5 Anti-recálculo).
 *
 * @param columns - Anchos de columna. Default = 7 columnas del Libro Diario (retrocompatible).
 */
export async function construirHoja(
  filas: Celda[][],
  columns: ColumnaHoja[] = COLUMNS_LIBRO_DIARIO,
): Promise<Blob> {
  const datos = filas.map((fila) =>
    fila.map((celda) => {
      // Propaga fontWeight solo si está definido (exactOptionalPropertyTypes)
      const estilo = {
        ...(celda.fontWeight !== undefined ? { fontWeight: celda.fontWeight } : {}),
        // align por default 'right' en numérico (montos siempre a la derecha, §4.5);
        // el override explícito gana. Texto: solo si fue seteado explícitamente.
        ...(celda.type === 'numero'
          ? { align: celda.align ?? 'right' }
          : celda.align !== undefined
            ? { align: celda.align }
            : {}),
      };

      if (celda.type === 'numero') {
        return {
          type: Number,
          value: parsearMontoCelda(celda.value),
          format: '#,##0.00',
          ...estilo,
        };
      }
      return {
        type: String,
        value: celda.value,
        ...estilo,
      };
    }),
  );

  const resultado = await writeXlsxFile(datos, { columns });

  return resultado.toBlob();
}
