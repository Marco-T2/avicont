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

export type CeldaCruda = string | Date | boolean | null;
export type FilaCruda = readonly CeldaCruda[];
export type MatrizXlsx = readonly FilaCruda[];

export async function leerMatrizXlsx(buffer: Buffer): Promise<MatrizXlsx> {
  const hojas = await readXlsxFile(buffer, { parseNumber: (s: string) => s });
  const primera = hojas[0];
  if (!primera) return [];
  return primera.data as MatrizXlsx;
}
