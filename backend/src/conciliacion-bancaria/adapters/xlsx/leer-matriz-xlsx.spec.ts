/**
 * Riesgo R4 (design §13, ampliado rev5) — el primer test del slice 3 corre
 * contra los fixtures reales de v1: `parseNumber` debe interceptar toda celda
 * de formato numérico "General" como string, y — el caso que rompería un
 * lector SAX ingenuo — Económico (que envuelve TODO en el prefijo de
 * namespace `x:` — `<x:worksheet>`, `<x:row>`, `<x:c>`, `<x:v>`) debe devolver
 * sus filas REALES, no una lista vacía.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { leerMatrizXlsx } from './leer-matriz-xlsx';

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

function leerFixture(nombre: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, nombre));
}

describe('leerMatrizXlsx (riesgo R4 — namespace x: de Económico)', () => {
  it('BancoSol: devuelve filas reales, con encabezados de columna en la fila 17 (índice 16)', async () => {
    const matriz = await leerMatrizXlsx(leerFixture('bancosol-a-mayo-junio.xlsx'));

    expect(matriz.length).toBeGreaterThan(1);
    expect(matriz[16]).toEqual([
      'Fecha',
      'Hora',
      'Nro Trn./Cheque',
      null,
      'Transacción',
      null,
      null,
      null,
      'Nota',
      null,
      null,
      'Monto',
      'Saldo',
    ]);
  });

  it('Económico (namespace x: en TODOS los elementos del XML) — NO debe devolver cero filas', async () => {
    const matriz = await leerMatrizXlsx(leerFixture('economico-extracto.xlsx'));

    // Riesgo R4: un lector SAX que matchee row/c/v sin contemplar el
    // namespace `x:` devolvería silenciosamente una lista vacía acá.
    expect(matriz.length).toBeGreaterThan(1);
    expect(matriz[16]?.[0]).toBe('Fecha');
  });

  it('celdas de formato numérico "General" (Monto/Saldo) llegan como STRING, nunca number', async () => {
    const matriz = await leerMatrizXlsx(leerFixture('bancosol-a-mayo-junio.xlsx'));

    const filaDatos = matriz[17];
    expect(typeof filaDatos?.[11]).toBe('string'); // Monto
    expect(typeof filaDatos?.[12]).toBe('string'); // Saldo
  });

  it('Económico: la celda Fecha llega como STRING de texto (dialecto TEXTO_ES_DD_MMM_YYYY)', async () => {
    const matriz = await leerMatrizXlsx(leerFixture('economico-extracto.xlsx'));

    const filaDatos = matriz[17];
    expect(typeof filaDatos?.[0]).toBe('string');
    expect(filaDatos?.[0]).toMatch(/^\d{2}\/[A-Za-zÁ-ú]{3}\/\d{4}$/);
  });

  it('BancoSol: la celda Fecha llega como Date nativo (DESCUBRIMIENTO — parseNumber no la intercepta)', async () => {
    const matriz = await leerMatrizXlsx(leerFixture('bancosol-a-mayo-junio.xlsx'));

    const filaDatos = matriz[17];
    expect(filaDatos?.[0]).toBeInstanceOf(Date);
  });
});
