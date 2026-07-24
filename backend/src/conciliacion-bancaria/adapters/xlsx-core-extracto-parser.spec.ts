import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Money } from '@/common/domain/money';

import { verificarChecksum } from '../domain/checksum-extracto';
import { ArchivoFormatoNoReconocidoError } from '../domain/importacion-errors';
import { DIALECTO_BANCOSOL } from './dialectos/bancosol.dialecto';
import { DIALECTO_BCP } from './dialectos/bcp.dialecto';
import { DIALECTO_ECONOMICO } from './dialectos/economico.dialecto';
import { DIALECTO_UNION_XLSX } from './dialectos/union.dialecto';
import { XlsxCoreExtractoParser } from './xlsx-core-extracto-parser';
import { buscarValorDeEtiqueta } from './xlsx/escaneo-cabecera';
import { leerMatrizXlsx } from './xlsx/leer-matriz-xlsx';

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

// ============================================================
// Slice 4 — Unión XLSX (design §4.3.1). Dialecto PROPIO: NO comparte
// generador con BancoSol/Económico (columnas y cabecera de otra fuente).
// ============================================================
describe('XlsxCoreExtractoParser — Unión XLSX (tasks 4.1/4.4/4.7/4.8)', () => {
  const parser = new XlsxCoreExtractoParser(DIALECTO_UNION_XLSX);

  it('reconoce() -> true contra el fixture real (hoja ExtractoMovimientosFechas)', async () => {
    await expect(parser.reconoce(leerFixture('union-extracto-por-rango.xlsx'))).resolves.toBe(true);
  });

  it('parse() — 21 movimientos, orden ASCENDENTE, numeroCuentaDeclarado limpio (REQ-CB-16)', async () => {
    const resultado = await parser.parse(leerFixture('union-extracto-por-rango.xlsx'));

    expect(resultado.movimientos).toHaveLength(21);
    // Valor REAL del fixture anonimizado (slice 0) — NO el '10000024346492'
    // citado en design/tasks, que corresponde al documento original antes
    // de anonimizar. El fixture manda.
    expect(resultado.numeroCuentaDeclarado).toBe('86698879426068');
    // DERIVADO: el archivo no declara saldo inicial/final en la cabecera.
    expect(resultado.saldoInicialDeclarado).toBeNull();
    expect(resultado.saldoFinalDeclarado).toBeNull();

    const primero = resultado.movimientos[0]!;
    expect(primero.fecha.toIso()).toBe('2026-04-02');
    expect(primero.monto.toBob()).toBe('900.00');
    expect(primero.tipo).toBe('DEBITO');
    expect(primero.saldo?.toBob()).toBe('2243.43');
    expect(primero.referencia).toBe('5275074184');

    const ultimo = resultado.movimientos[resultado.movimientos.length - 1]!;
    expect(ultimo.fecha.toIso()).toBe('2026-07-13');
    expect(ultimo.monto.toBob()).toBe('200.00');
    expect(ultimo.tipo).toBe('DEBITO');
    expect(ultimo.saldo?.toBob()).toBe('11909.40');

    // Padding + miles + signo (design §8.1) sobre una fila intermedia real:
    // '             12,600.00' -> CREDITO 12600.00 (fila del 08/06/2026).
    const credito = resultado.movimientos.find((m) => m.fecha.toIso() === '2026-06-08')!;
    expect(credito.monto.toBob()).toBe('12600.00');
    expect(credito.tipo).toBe('CREDITO');
  });

  it('renglón dorado (design §4.5): descripcion = columna Descripción exacta, sin concatenar', async () => {
    const resultado = await parser.parse(leerFixture('union-extracto-por-rango.xlsx'));

    const primero = resultado.movimientos[0]!;
    expect(primero.descripcion).toBe('N/D POR TRASPASO ENTRE BANCOS ACH');
  });

  it('REQ-CB-08 checksum DERIVADO — ancla: inicial derivado 3.143,43 + neto 8.765,97 = 11.909,40 == saldo final (task 4.5)', async () => {
    const resultado = await parser.parse(leerFixture('union-extracto-por-rango.xlsx'));

    const primero = resultado.movimientos[0]!;
    // saldoInicial = saldo(primero) + monto(primero) porque primero es DEBITO.
    const saldoInicialDerivado = primero.saldo!.plus(primero.monto);
    expect(saldoInicialDerivado.toBob()).toBe('3143.43');

    const neto = resultado.movimientos.reduce(
      (acc, m) => (m.tipo === 'CREDITO' ? acc.plus(m.monto) : acc.minus(m.monto)),
      Money.ZERO,
    );
    expect(neto.toBob()).toBe('8765.97');

    const ultimo = resultado.movimientos[resultado.movimientos.length - 1]!;
    expect(saldoInicialDerivado.plus(neto).igualaConTolerancia(ultimo.saldo!)).toBe(true);
  });

  it('REQ-CB-08 verificación ADICIONAL (task 4.6, NO es la estrategia): Total Créditos/Débitos/Total declarados cuadran contra los movimientos', async () => {
    const buffer = leerFixture('union-extracto-por-rango.xlsx');
    const resultado = await parser.parse(buffer);
    const matriz = await leerMatrizXlsx(buffer);

    const totalCreditosDeclarado = buscarValorDeEtiqueta(matriz, 'Total Créditos:', 50);
    const totalDebitosDeclarado = buscarValorDeEtiqueta(matriz, 'Total Débitos:', 50);

    expect(totalCreditosDeclarado).toBe('12,618.94');
    expect(totalDebitosDeclarado).toBe('3,852.97');

    // El bloque "Tránsito/Consultado/Congelado/Sobregirado/Disponible/Total"
    // (fila 43 1-based) es una tabla de 2 filas — etiqueta arriba, valor UNA
    // fila abajo en la MISMA columna — a diferencia de "Cuenta:"/"Total
    // Créditos:" (etiqueta y valor en la misma fila). `buscarValorDeEtiqueta`
    // no cubre ese layout; se verifica por posición ya confirmada contra el
    // fixture real (fila 43 índice 28 = "Total", fila 45 índice 28 = valor).
    const filaEtiquetaTotal = matriz.findIndex((fila) => fila.some((celda) => celda === 'Total'));
    expect(filaEtiquetaTotal).toBeGreaterThan(-1);
    const columnaTotal = matriz[filaEtiquetaTotal]!.findIndex((celda) => celda === 'Total');
    const totalDeclarado = matriz[filaEtiquetaTotal + 2]?.[columnaTotal] ?? null;

    expect(totalDeclarado).toBe('11,909.40');

    const sumaCreditos = resultado.movimientos
      .filter((m) => m.tipo === 'CREDITO')
      .reduce((acc, m) => acc.plus(m.monto), Money.ZERO);
    const sumaDebitos = resultado.movimientos
      .filter((m) => m.tipo === 'DEBITO')
      .reduce((acc, m) => acc.plus(m.monto), Money.ZERO);

    expect(sumaCreditos.toBob()).toBe('12618.94');
    expect(sumaDebitos.toBob()).toBe('3852.97');

    // saldo corrido coherente fila a fila (saldoᵢ₋₁ + montoᵢ = saldoᵢ) en las 21 filas.
    for (let i = 1; i < resultado.movimientos.length; i++) {
      const anterior = resultado.movimientos[i - 1]!;
      const actual = resultado.movimientos[i]!;
      const esperado =
        actual.tipo === 'CREDITO'
          ? anterior.saldo!.plus(actual.monto)
          : anterior.saldo!.minus(actual.monto);
      expect(esperado.igualaConTolerancia(actual.saldo!)).toBe(true);
    }
  });
});

describe('XlsxCoreExtractoParser — anti-reuso de mapeo Unión ↔ BancoSol/Económico (task 4.1, design §11)', () => {
  it('reconoce(): el dialecto BancoSol NO reconoce el fixture de Unión', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_BANCOSOL);
    await expect(parser.reconoce(leerFixture('union-extracto-por-rango.xlsx'))).resolves.toBe(
      false,
    );
  });

  it('reconoce(): el dialecto Económico NO reconoce el fixture de Unión', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_ECONOMICO);
    await expect(parser.reconoce(leerFixture('union-extracto-por-rango.xlsx'))).resolves.toBe(
      false,
    );
  });

  it('reconoce(): el dialecto Unión NO reconoce el fixture de BancoSol', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_UNION_XLSX);
    await expect(parser.reconoce(leerFixture('bancosol-a-mayo-junio.xlsx'))).resolves.toBe(false);
  });

  it('reconoce(): el dialecto Unión NO reconoce el fixture de Económico', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_UNION_XLSX);
    await expect(parser.reconoce(leerFixture('economico-extracto.xlsx'))).resolves.toBe(false);
  });

  it('parse(): parsear el fixture de Unión con el dialecto de BancoSol FALLA por etiquetas ausentes — nunca devuelve datos corridos', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_BANCOSOL);
    await expect(parser.parse(leerFixture('union-extracto-por-rango.xlsx'))).rejects.toThrow(
      ArchivoFormatoNoReconocidoError,
    );
  });

  it('parse(): parsear el fixture de BancoSol con el dialecto de Unión FALLA por etiquetas ausentes — nunca devuelve datos corridos', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_UNION_XLSX);
    await expect(parser.parse(leerFixture('bancosol-a-mayo-junio.xlsx'))).rejects.toThrow(
      ArchivoFormatoNoReconocidoError,
    );
  });
});

// ============================================================
// BCP XLSX. Dialecto PROPIO (no comparte generador con ninguno de los tres
// anteriores) y PRIMER perfil con `estrategiaChecksum: 'DECLARADO'` sobre
// este motor: el archivo publica `Saldo Inicial:`/`Saldo Final:`.
// ============================================================
describe('XlsxCoreExtractoParser — BCP XLSX', () => {
  const parser = new XlsxCoreExtractoParser(DIALECTO_BCP);

  it('reconoce() -> true contra su propio fixture', async () => {
    await expect(parser.reconoce(leerFixture('bcp-extracto.xlsx'))).resolves.toBe(true);
  });

  it('parse() — 15 movimientos, saldos DECLARADOS en cabecera, número de cuenta limpio', async () => {
    const resultado = await parser.parse(leerFixture('bcp-extracto.xlsx'));

    expect(resultado.movimientos).toHaveLength(15);
    expect(resultado.numeroCuentaDeclarado).toBe('201-99887766-5-42');
    expect(resultado.saldoInicialDeclarado?.toBob()).toBe('2993.12');
    expect(resultado.saldoFinalDeclarado?.toBob()).toBe('23090.50');
  });

  it('fecha compacta YYYYMMDD + hora desde la columna separada', async () => {
    const resultado = await parser.parse(leerFixture('bcp-extracto.xlsx'));

    const primero = resultado.movimientos[0]!;
    expect(primero.fecha.toIso()).toBe('2026-07-01');
    expect(primero.hora).toBe('00:00:00');

    const conHora = resultado.movimientos.find((m) => m.hora === '08:18:17')!;
    expect(conHora.fecha.toIso()).toBe('2026-07-02');

    const ultimo = resultado.movimientos[resultado.movimientos.length - 1]!;
    expect(ultimo.fecha.toIso()).toBe('2026-07-15');
  });

  it('signo del monto → tipo, y el saldo conserva el suyo', async () => {
    const resultado = await parser.parse(leerFixture('bcp-extracto.xlsx'));

    const credito = resultado.movimientos[0]!;
    expect(credito.monto.toBob()).toBe('11.01');
    expect(credito.tipo).toBe('CREDITO');
    expect(credito.saldo?.toBob()).toBe('3004.13');

    const debito = resultado.movimientos[1]!;
    expect(debito.monto.toBob()).toBe('1.43');
    expect(debito.tipo).toBe('DEBITO');
    expect(debito.saldo?.toBob()).toBe('3002.70');

    // Miles con coma en la columna Saldo (`30,090.50`).
    const grande = resultado.movimientos.find((m) => m.monto.toBob() === '30000.00')!;
    expect(grande.tipo).toBe('CREDITO');
    expect(grande.saldo?.toBob()).toBe('30090.50');
  });

  // El extracto real trae `4.6500000000000004` en la celda de monto: el ruido
  // binario de un float que el generador serializó tal cual. `Money.of` opera
  // sobre el STRING crudo, nunca sobre `Number()` (CLAUDE.md §4.5) — si algún
  // día alguien mete un `Number()` en el camino, este test lo caza.
  it('monto con ruido de float (4.6500000000000004) → 4.65 exacto, sin pasar por Number()', async () => {
    const resultado = await parser.parse(leerFixture('bcp-extracto.xlsx'));

    const rcomplint = resultado.movimientos.find((m) => m.descripcion.startsWith('RComplint'))!;
    expect(rcomplint.monto.toBob()).toBe('4.65');
    expect(rcomplint.tipo).toBe('CREDITO');
    expect(rcomplint.saldo?.toBob()).toBe('2627.35');
  });

  it('renglón dorado: descripcion = Descripción + " " + Medio de Atención (Lugar excluido a propósito)', async () => {
    const resultado = await parser.parse(leerFixture('bcp-extracto.xlsx'));

    expect(resultado.movimientos[0]!.descripcion).toBe('Interesganado Automático');
    // `Lugar` es constante en todo el extracto ('Agencia Central la Paz'): no
    // discrimina y no debe ensuciar la descripción ni el hash de dedup.
    expect(resultado.movimientos.some((m) => m.descripcion.includes('Agencia Central'))).toBe(
      false,
    );
  });

  it('REQ-CB-08 checksum DECLARADO — 2.993,12 + neto = 23.090,50 == saldo final declarado', async () => {
    const resultado = await parser.parse(leerFixture('bcp-extracto.xlsx'));

    const neto = resultado.movimientos.reduce(
      (acc, m) => (m.tipo === 'CREDITO' ? acc.plus(m.monto) : acc.minus(m.monto)),
      Money.ZERO,
    );
    expect(resultado.saldoInicialDeclarado!.plus(neto).toBob()).toBe('23090.50');

    const checksum = verificarChecksum('DECLARADO', resultado.movimientos, {
      saldoInicialDeclarado: resultado.saldoInicialDeclarado,
      saldoFinalDeclarado: resultado.saldoFinalDeclarado,
    });
    expect(checksum.estadoVerificacion).toBe('VERIFICADO');
    expect(checksum.diferencia).toBeNull();
  });

  it('saldo corrido coherente fila a fila (saldoᵢ₋₁ ± montoᵢ = saldoᵢ) en las 15 filas', async () => {
    const resultado = await parser.parse(leerFixture('bcp-extracto.xlsx'));

    for (let i = 1; i < resultado.movimientos.length; i++) {
      const anterior = resultado.movimientos[i - 1]!;
      const actual = resultado.movimientos[i]!;
      const esperado =
        actual.tipo === 'CREDITO'
          ? anterior.saldo!.plus(actual.monto)
          : anterior.saldo!.minus(actual.monto);
      expect(esperado.igualaConTolerancia(actual.saldo!)).toBe(true);
    }
  });

  it('la nota legal al pie NO entra como movimiento (corta en la primera fila sin Fecha)', async () => {
    const resultado = await parser.parse(leerFixture('bcp-extracto.xlsx'));

    expect(resultado.movimientos.some((m) => m.descripcion.includes('carece de valor legal'))).toBe(
      false,
    );
  });
});

describe('XlsxCoreExtractoParser — anti-reuso de mapeo BCP ↔ resto de perfiles', () => {
  const otros = [
    ['BancoSol', DIALECTO_BANCOSOL, 'bancosol-a-mayo-junio.xlsx'],
    ['Económico', DIALECTO_ECONOMICO, 'economico-extracto.xlsx'],
    ['Unión', DIALECTO_UNION_XLSX, 'union-extracto-por-rango.xlsx'],
  ] as const;

  it.each(otros)('el dialecto %s NO reconoce el fixture de BCP', async (_nombre, dialecto) => {
    const parser = new XlsxCoreExtractoParser(dialecto);
    await expect(parser.reconoce(leerFixture('bcp-extracto.xlsx'))).resolves.toBe(false);
  });

  it.each(otros)(
    'el dialecto BCP NO reconoce el fixture de %s',
    async (_nombre, _dialecto, fixture) => {
      const parser = new XlsxCoreExtractoParser(DIALECTO_BCP);
      await expect(parser.reconoce(leerFixture(fixture))).resolves.toBe(false);
    },
  );

  it.each(otros)(
    'parse(): el fixture de BCP con el dialecto de %s FALLA — nunca devuelve datos corridos',
    async (_nombre, dialecto) => {
      const parser = new XlsxCoreExtractoParser(dialecto);
      await expect(parser.parse(leerFixture('bcp-extracto.xlsx'))).rejects.toThrow(
        ArchivoFormatoNoReconocidoError,
      );
    },
  );

  it.each(otros)(
    'parse(): el fixture de %s con el dialecto de BCP FALLA — nunca devuelve datos corridos',
    async (_nombre, _dialecto, fixture) => {
      const parser = new XlsxCoreExtractoParser(DIALECTO_BCP);
      await expect(parser.parse(leerFixture(fixture))).rejects.toThrow(
        ArchivoFormatoNoReconocidoError,
      );
    },
  );
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
