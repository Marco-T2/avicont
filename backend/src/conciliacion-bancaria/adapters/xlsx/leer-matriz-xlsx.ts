/**
 * Única puerta de lectura cruda de un `.xlsx` a matriz de celdas (design §8.1,
 * §8.3, riesgo R4). `read-excel-file` se configura con
 * `{ parseNumber: (s) => s }` para que las celdas de formato numérico
 * "General" lleguen como STRING crudo — nunca `Number()` (CLAUDE.md §4.5).
 *
 * DESCUBRIMIENTO (riesgo R4, verificado contra los fixtures reales — no
 * asumido): `parseNumber` SOLO intercepta celdas con formato numérico
 * genérico. Las celdas con estilo de FECHA en Excel (ej. la columna `Fecha`/
 * `Hora` del generador BancoSol/Económico) NO pasan por `parseNumber` —
 * `read-excel-file` las resuelve como `Date` nativo ANTES de que
 * `parseNumber` pueda intervenir. Verificado: BancoSol trae `Date` en esas
 * columnas (celda con formato de fecha real en el `.xlsx`); Económico trae
 * STRING `'03/Jun/2026'` (celda de texto plano, sin formato de fecha) — es
 * la señal estructural que además permite discriminar entre ambos dialectos
 * pese a compartir generador (ver `xlsx-core-extracto-parser.ts`).
 *
 * `MatrizXlsx` expone el tipo `CeldaCruda` explícitamente para que cada
 * dialecto decida cómo tratar cada caso — nunca se asume "todo string".
 */
// read-excel-file@9.3.3 (design pide 9.3.4 EXACTO; bloqueado por la política
// de `minimumReleaseAge` del entorno — publicado 2026-07-21, dentro de la
// ventana de 3 días desde "hoy" 2026-07-23. Se usa la última versión MADURA
// pineada exacta, 9.3.3, publicada 2026-07-20. Ver reporte de apply.
import readXlsxFile from 'read-excel-file/node';

import { sanearXlsxJasperReports } from './sanear-xlsx-jasperreports';

export type CeldaCruda = string | Date | boolean | null;
export type FilaCruda = readonly CeldaCruda[];
export type MatrizXlsx = readonly FilaCruda[];

/**
 * El saneo de JasperReports (FIE) corre acá, UNIVERSAL para todos los
 * perfiles, y no como dato del dialecto a propósito: condicionarlo obligaría
 * a aplicarlo en DOS call sites (`reconoce()` y `parse()`), y olvidarlo en
 * `reconoce()` dejaría un bug silencioso donde el archivo real nunca se
 * detecta. El saneo es idempotente y, sobre un archivo sano, sus hojas
 * quedan byte a byte idénticas — una sola puerta elimina la clase de error.
 *
 * Si el buffer ni siquiera es un zip válido, se devuelve intacto para que
 * `readXlsxFile` produzca el mismo error de siempre (la superficie de error
 * hacia arriba no cambia).
 */
function sanear(buffer: Buffer): Buffer {
  try {
    return sanearXlsxJasperReports(buffer);
  } catch {
    return buffer;
  }
}

export async function leerMatrizXlsx(buffer: Buffer): Promise<MatrizXlsx> {
  const hojas = await readXlsxFile(sanear(buffer), { parseNumber: (s: string) => s });
  const primera = hojas[0];
  if (!primera) return [];
  return primera.data as MatrizXlsx;
}
