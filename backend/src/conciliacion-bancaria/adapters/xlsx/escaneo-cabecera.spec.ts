import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buscarFilaEncabezados, buscarValorDeEtiqueta } from './escaneo-cabecera';
import { leerMatrizXlsx } from './leer-matriz-xlsx';
import type { MatrizXlsx } from './leer-matriz-xlsx';

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

function leerFixture(nombre: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, nombre));
}

describe('buscarValorDeEtiqueta', () => {
  let bancosol: MatrizXlsx;
  let economico: MatrizXlsx;

  beforeAll(async () => {
    bancosol = await leerMatrizXlsx(leerFixture('bancosol-a-mayo-junio.xlsx'));
    economico = await leerMatrizXlsx(leerFixture('economico-extracto.xlsx'));
  });

  it('BancoSol: "Cuenta:" -> valor real del fixture (celda no adyacente, hay una celda vacía en medio)', () => {
    expect(buscarValorDeEtiqueta(bancosol, 'Cuenta:', 20)).toBe('5799375-760-305');
  });

  it('Económico: "Cuenta:" -> valor CRUDO contaminado (el strip lo hace el dialecto, no este helper)', () => {
    expect(buscarValorDeEtiqueta(economico, 'Cuenta:', 20)).toBe('CA: 6484254835 (Bs)');
  });

  it('Económico: "Saldo Inicial:" / "Saldo Final:" -> valores declarados reales', () => {
    expect(buscarValorDeEtiqueta(economico, 'Saldo Inicial:', 20)).toBe('327,520.14');
    expect(buscarValorDeEtiqueta(economico, 'Saldo Final:', 20)).toBe('179,757.37');
  });

  it('BancoSol: NO trae "Saldo Inicial:" en la cabecera (señal estructural de DERIVADO vs DECLARADO)', () => {
    expect(buscarValorDeEtiqueta(bancosol, 'Saldo Inicial:', 20)).toBeNull();
  });

  it('etiqueta ausente -> null', () => {
    expect(buscarValorDeEtiqueta(bancosol, 'Etiqueta Que No Existe:', 20)).toBeNull();
  });
});

describe('buscarFilaEncabezados — mapeo por NOMBRE, nunca por índice', () => {
  it('BancoSol: encuentra la fila 17 (índice 16) y los índices de columna correctos', async () => {
    const matriz = await leerMatrizXlsx(leerFixture('bancosol-a-mayo-junio.xlsx'));

    const resultado = buscarFilaEncabezados(
      matriz,
      ['Fecha', 'Hora', 'Transacción', 'Nota', 'Monto', 'Saldo'],
      30,
    );

    expect(resultado).not.toBeNull();
    expect(resultado?.indiceFila).toBe(16);
    expect(resultado?.columnas.get('FECHA')).toBe(0);
    expect(resultado?.columnas.get('TRANSACCION')).toBe(4);
    expect(resultado?.columnas.get('NOTA')).toBe(8);
    expect(resultado?.columnas.get('MONTO')).toBe(11);
    expect(resultado?.columnas.get('SALDO')).toBe(12);
  });

  it('reordenar columnas del fixture (matriz sintética) y seguir encontrando la fila igual', () => {
    const matrizReordenada: MatrizXlsx = [
      ['Saldo', 'Monto', 'Fecha', 'Nota', 'Transacción', 'Hora'],
      ['100.00', '50.00', new Date(), 'nota x', 'transaccion y', new Date()],
    ];

    const resultado = buscarFilaEncabezados(
      matrizReordenada,
      ['Fecha', 'Hora', 'Transacción', 'Nota', 'Monto', 'Saldo'],
      5,
    );

    expect(resultado?.indiceFila).toBe(0);
    expect(resultado?.columnas.get('FECHA')).toBe(2);
    expect(resultado?.columnas.get('SALDO')).toBe(0);
  });

  it('etiquetas requeridas incompletas -> null (no confunde una fila parcial con la de encabezados)', () => {
    const matriz: MatrizXlsx = [['Fecha', 'Monto']];
    expect(buscarFilaEncabezados(matriz, ['Fecha', 'Hora', 'Monto'], 5)).toBeNull();
  });
});
