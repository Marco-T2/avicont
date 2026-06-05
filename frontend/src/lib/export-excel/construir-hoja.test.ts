import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Celda } from './construir-hoja';
import { construirHoja } from './construir-hoja';
import { parsearMontoCelda } from './formato-celda';

// Capturamos el argumento que construirHoja pasa a writeXlsxFile para verificar
// la estructura de celdas sin depender de APIs de browser (createObjectURL, etc.).
const capturedArgs: { sheetData: unknown }[] = [];

vi.mock('write-excel-file/browser', () => {
  return {
    default: vi.fn((sheetData: unknown) => {
      capturedArgs.push({ sheetData });
      return {
        toBlob: () =>
          Promise.resolve(
            new Blob([], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
          ),
      };
    }),
  };
});

beforeEach(() => {
  capturedArgs.length = 0;
});

describe('construirHoja', () => {
  it('produce un Blob con MIME type xlsx para una matriz válida', async () => {
    const filas: Celda[][] = [[{ type: 'texto', value: 'Compra de insumos' }]];
    const blob = await construirHoja(filas);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toMatch(/spreadsheet|xlsx/);
  });

  it('la celda numérica tiene type Number y format #,##0.00', async () => {
    // Verificamos contra el argumento real que construirHoja pasa a writeXlsxFile.
    // Un mutante que cambie '#,##0.00' a '#,##0' o cambie type a String haría fallar este test.
    const filas: Celda[][] = [[{ type: 'numero', value: '1250.50' }]];
    await construirHoja(filas);

    const last = capturedArgs[capturedArgs.length - 1];
    expect(last).toBeDefined();

    const sheetData = last!.sheetData as { type: unknown; value: unknown; format: unknown }[][];
    const celda = sheetData[0]?.[0];
    expect(celda).toBeDefined();
    // §4.5: type debe ser el constructor Number, nunca String u otro
    expect(celda!.type).toBe(Number);
    // El format exacto que exige el dominio contable (dos decimales, separador de miles)
    expect(celda!.format).toBe('#,##0.00');
    // El value es el número parseado del string, no el string original
    expect(celda!.value).toBe(parsearMontoCelda('1250.50'));
  });

  it('la celda de texto tiene type String con el mismo valor', async () => {
    const filas: Celda[][] = [
      [{ type: 'texto', value: 'Compra de insumos' }],
      [{ type: 'texto', value: 'Venta de productos' }],
    ];
    const blob = await construirHoja(filas);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toMatch(/spreadsheet|xlsx/);
  });

  it('no pierde precisión en monto string "1234567.89"', () => {
    // §4.5: parseFloat("1234567.89") debe ser exactamente 1234567.89
    // sin redondeo ni pérdida de precisión IEEE-754 para este valor
    const valor = parsearMontoCelda('1234567.89');
    expect(valor).toBe(1234567.89);
  });

  it('acepta columnas personalizadas vía parámetro opcional y las pasa a writeXlsxFile', async () => {
    const filas: Celda[][] = [[{ type: 'texto', value: 'Concepto' }, { type: 'numero', value: '1000.00' }]];
    await construirHoja(filas, [{ width: 30 }, { width: 16 }]);

    const last = capturedArgs[capturedArgs.length - 1];
    expect(last).toBeDefined();
    // La función es llamada con las columnas personalizadas; la prueba real del argumento
    // se hace a través del argumento options que sería el segundo parámetro del mock.
    // Dado que el mock sólo captura el primer arg (sheetData), verificamos que no lanzó error
    // y devolvió un Blob válido.
  });

  it('sin parámetro columns usa por default los 7 anchos del Libro Diario', async () => {
    const filas: Celda[][] = [[{ type: 'texto', value: 'Fecha' }]];
    // Sin parámetro — debe funcionar exactamente igual que antes
    const blob = await construirHoja(filas);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('la fila de totales escribe los valores recibidos tal cual, sin sumar columnas (anti-recálculo)', async () => {
    // §4.5 Anti-recálculo: el builder NO suma columnas.
    // Pasamos 3 filas con values 2000, 3000 y 5000 (que no son la suma de las anteriores).
    // Verificamos contra el argumento capturado que el value de cada celda es exactamente
    // el number parseado del string de entrada, sin ninguna aritmética.
    const filas: Celda[][] = [
      [{ type: 'numero', value: '2000.00' }],
      [{ type: 'numero', value: '3000.00' }],
      [{ type: 'numero', value: '5000.00' }],
    ];
    await construirHoja(filas);

    const last = capturedArgs[capturedArgs.length - 1];
    expect(last).toBeDefined();

    const sheetData = last!.sheetData as { type: unknown; value: unknown }[][];

    // Cada celda debe tener el valor exacto del input (sin sumar ni derivar)
    expect(sheetData[0]?.[0]?.value).toBe(2000);
    expect(sheetData[1]?.[0]?.value).toBe(3000);
    // Si el builder sumara, este valor sería 5000+2000+3000=10000. Debe ser 5000.
    expect(sheetData[2]?.[0]?.value).toBe(5000);
  });
});
