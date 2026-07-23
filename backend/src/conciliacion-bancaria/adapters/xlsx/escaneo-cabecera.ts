/**
 * Escaneo genérico de una matriz XLSX por NOMBRE de etiqueta, nunca por
 * índice de celda fijo (design §8.3, CLAUDE.md — mapeo por nombre). Dos
 * necesidades distintas, mismo mecanismo de normalización
 * (`normalizarDescripcion`, reusado — design §4.5, la etiqueta `'Monto\n'`
 * de Unión con salto de línea matchea gracias a este colapso):
 *
 *   1. Pares etiqueta→valor sueltos en el bloque de cabecera ("Cuenta:",
 *      "Saldo Inicial:", …) — el valor está en la PRIMERA celda no-nula a la
 *      derecha de la etiqueta, en la MISMA fila (puede haber celdas vacías
 *      intermedias por celdas combinadas — verificado: BancoSol/Económico
 *      `E4='Cuenta:'` con `F4` vacía, valor recién en `G4`).
 *   2. La fila de encabezados de la tabla de movimientos — la fila que
 *      contiene TODAS las etiquetas requeridas, sin importar el índice de
 *      columna real (#953 trampa 4: los índices varían entre bancos e
 *      incluso entre exports del mismo banco).
 */
import { normalizarDescripcion } from '../../domain/normalizar-descripcion';
import type { CeldaCruda, MatrizXlsx } from './leer-matriz-xlsx';

function normalizarEtiqueta(valor: CeldaCruda): string | null {
  if (typeof valor !== 'string') return null;
  const normalizada = normalizarDescripcion(valor);
  return normalizada.length > 0 ? normalizada : null;
}

/**
 * Busca `etiqueta` (normalizada) en las primeras `filasMax` filas de la
 * matriz. Devuelve el valor de la PRIMERA celda no-nula a la derecha, en la
 * misma fila, o `null` si la etiqueta no aparece.
 */
export function buscarValorDeEtiqueta(
  matriz: MatrizXlsx,
  etiqueta: string,
  filasMax: number,
): CeldaCruda | null {
  const etiquetaNormalizada = normalizarDescripcion(etiqueta);
  const limite = Math.min(filasMax, matriz.length);

  for (let fila = 0; fila < limite; fila++) {
    const filaCeldas = matriz[fila];
    if (!filaCeldas) continue;

    for (let col = 0; col < filaCeldas.length; col++) {
      if (normalizarEtiqueta(filaCeldas[col] ?? null) !== etiquetaNormalizada) continue;

      for (let derecha = col + 1; derecha < filaCeldas.length; derecha++) {
        const candidato = filaCeldas[derecha] ?? null;
        if (candidato !== null) return candidato;
      }
      return null; // etiqueta encontrada pero sin valor a la derecha
    }
  }
  return null;
}

export interface FilaEncabezadosEncontrada {
  readonly indiceFila: number;
  /** etiqueta normalizada -> índice de columna en esa fila. */
  readonly columnas: ReadonlyMap<string, number>;
}

/**
 * Busca, en las primeras `filasMax` filas, la fila que contiene TODAS las
 * `etiquetasRequeridas` (normalizadas). Devuelve el índice de fila y el mapa
 * etiqueta→columna. `null` si ninguna fila las trae todas.
 */
export function buscarFilaEncabezados(
  matriz: MatrizXlsx,
  etiquetasRequeridas: readonly string[],
  filasMax: number,
): FilaEncabezadosEncontrada | null {
  const requeridasNormalizadas = etiquetasRequeridas.map((e) => normalizarDescripcion(e));
  const limite = Math.min(filasMax, matriz.length);

  for (let fila = 0; fila < limite; fila++) {
    const filaCeldas = matriz[fila];
    if (!filaCeldas) continue;

    const columnas = new Map<string, number>();
    for (let col = 0; col < filaCeldas.length; col++) {
      const etiqueta = normalizarEtiqueta(filaCeldas[col] ?? null);
      if (etiqueta !== null && !columnas.has(etiqueta)) {
        columnas.set(etiqueta, col);
      }
    }

    const tieneTodas = requeridasNormalizadas.every((e) => columnas.has(e));
    if (tieneTodas) {
      return { indiceFila: fila, columnas };
    }
  }
  return null;
}
