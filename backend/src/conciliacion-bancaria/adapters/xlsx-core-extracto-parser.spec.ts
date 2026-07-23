import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DIALECTO_BANCOSOL } from './dialectos/bancosol.dialecto';
import { DIALECTO_ECONOMICO } from './dialectos/economico.dialecto';
import { XlsxCoreExtractoParser } from './xlsx-core-extracto-parser';

const FIXTURES_DIR = join(__dirname, '__fixtures__');

function leerFixture(nombre: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, nombre));
}

describe('XlsxCoreExtractoParser — BancoSol (task 3.4)', () => {
  const parser = new XlsxCoreExtractoParser(DIALECTO_BANCOSOL);

  it('reconoce() -> true contra el fixture de 20 movimientos', async () => {
    await expect(
      parser.reconoce(leerFixture('bancosol-20-movimientos-checksum.xlsx')),
    ).resolves.toBe(true);
  });

  it('parse() — 20 movimientos, checksum derivado 3.275,55 + (−3.040,38) = 235,17, numeroCuentaDeclarado limpio', async () => {
    const resultado = await parser.parse(leerFixture('bancosol-20-movimientos-checksum.xlsx'));

    expect(resultado.movimientos).toHaveLength(20);
    expect(resultado.numeroCuentaDeclarado).toBe('5799375-760-305');
    expect(resultado.saldoInicialDeclarado).toBeNull(); // DERIVADO — no declara saldo inicial
    expect(resultado.saldoFinalDeclarado).toBeNull();

    // Fila del movimiento más reciente del archivo (primera fila de datos, orden DESC del export).
    const masReciente = resultado.movimientos[0]!;
    expect(masReciente.monto.toBob()).toBe('200.00');
    expect(masReciente.tipo).toBe('DEBITO');
    expect(masReciente.saldo?.toBob()).toBe('235.17');
  });

  it('renglón dorado (design §4.5): descripcion = Transacción + " " + Nota exacto', async () => {
    const resultado = await parser.parse(leerFixture('bancosol-20-movimientos-checksum.xlsx'));

    const fila = resultado.movimientos[0]!; // row18: Transacción ACH... ver fixture real
    expect(fila.descripcion).toBe(
      'Transferencia via QR Beneficiario: 3554359-920-390 INES JUSTINIANO JUAN  Glosa: adelanto',
    );
  });

  it('60 movimientos en bancosol-a-mayo-junio.xlsx (criterio de aceptación R-1)', async () => {
    const resultado = await parser.parse(leerFixture('bancosol-a-mayo-junio.xlsx'));
    expect(resultado.movimientos).toHaveLength(60);
  });

  it('80 movimientos en bancosol-b-junio-julio.xlsx (criterio de aceptación R-1)', async () => {
    const resultado = await parser.parse(leerFixture('bancosol-b-junio-julio.xlsx'));
    expect(resultado.movimientos).toHaveLength(80);
  });
});

describe('XlsxCoreExtractoParser — Económico (task 3.5/3.6)', () => {
  const parser = new XlsxCoreExtractoParser(DIALECTO_ECONOMICO);

  it('reconoce() -> true contra su propio fixture', async () => {
    await expect(parser.reconoce(leerFixture('economico-extracto.xlsx'))).resolves.toBe(true);
  });

  it('parse() — 40 movimientos, saldo DECLARADO en cabecera, número de cuenta limpio (CRITICAL-2)', async () => {
    const resultado = await parser.parse(leerFixture('economico-extracto.xlsx'));

    expect(resultado.movimientos).toHaveLength(40);
    expect(resultado.numeroCuentaDeclarado).toBe('6484254835'); // strip de 'CA: ... (Bs)'
    expect(resultado.saldoInicialDeclarado?.toBob()).toBe('327520.14');
    expect(resultado.saldoFinalDeclarado?.toBob()).toBe('179757.37');
  });

  it('fechas de texto DD/Mmm/YYYY se parsean sin new Date(string)', async () => {
    const resultado = await parser.parse(leerFixture('economico-extracto.xlsx'));
    const primera = resultado.movimientos[0]!;
    expect(primera.fecha.toIso()).toBe('2026-06-03');
    expect(primera.hora).toBe('02:30:53');
  });
});

describe('XlsxCoreExtractoParser — discriminación cruzada (design §4.5, "mismo generador")', () => {
  it('el parser BancoSol NO reconoce el fixture de Económico (misma cabecera, distinto tipo de celda Fecha)', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_BANCOSOL);
    await expect(parser.reconoce(leerFixture('economico-extracto.xlsx'))).resolves.toBe(false);
  });

  it('el parser Económico NO reconoce el fixture de BancoSol', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_ECONOMICO);
    await expect(parser.reconoce(leerFixture('bancosol-a-mayo-junio.xlsx'))).resolves.toBe(false);
  });
});

describe('XlsxCoreExtractoParser — mapeo por nombre, nunca por índice (task 3.10)', () => {
  it('reconoce sigue funcionando si se reordenan las columnas del header (matriz sintética)', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_ECONOMICO);
    // Construimos un XLSX sintético reordenando columnas no es trivial sin
    // un generador real — la garantía de "por nombre" ya está cubierta por
    // `escaneo-cabecera.spec.ts` con una matriz sintética reordenada. Este
    // test confirma que el fixture real, cuyo layout NO coincide con los
    // índices fijos que un lector ingenuo asumiría (columnas D/F/G/H/J/K
    // vacías intercaladas), igual se reconoce correctamente.
    await expect(parser.reconoce(leerFixture('economico-extracto.xlsx'))).resolves.toBe(true);
  });
});
