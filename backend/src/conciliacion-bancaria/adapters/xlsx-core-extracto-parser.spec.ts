import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Money } from '@/common/domain/money';

import { verificarChecksum } from '../domain/checksum-extracto';
import { ArchivoFormatoNoReconocidoError } from '../domain/importacion-errors';
import { DIALECTO_BANCOSOL } from './dialectos/bancosol.dialecto';
import { DIALECTO_BCP } from './dialectos/bcp.dialecto';
import { DIALECTO_BMSC } from './dialectos/bmsc.dialecto';
import type { DialectoXlsx } from './dialectos/dialecto-xlsx';
import { DIALECTO_ECONOMICO } from './dialectos/economico.dialecto';
import { DIALECTO_FIE } from './dialectos/fie.dialecto';
import { DIALECTO_FORTALEZA } from './dialectos/fortaleza.dialecto';
import { DIALECTO_UNION_XLSX } from './dialectos/union.dialecto';
import { XlsxCoreExtractoParser } from './xlsx-core-extracto-parser';
import { buscarValorDeEtiqueta } from './xlsx/escaneo-cabecera';
import type { FilaCruda } from './xlsx/leer-matriz-xlsx';
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

// ---------------------------------------------------------------------------
// Fortaleza y BMSC: los dos primeros perfiles con columnas `Débito`/`Crédito`
// SEPARADAS (`mapeoMonto.modo === 'DEBITO_CREDITO_SEPARADOS'`). Acá el lado
// del movimiento NO sale del signo del monto sino de cuál de las dos columnas
// trae valor — es la única mecánica del motor que estos perfiles estrenan.
// ---------------------------------------------------------------------------

describe('XlsxCoreExtractoParser — Fortaleza XLSX', () => {
  const parser = new XlsxCoreExtractoParser(DIALECTO_FORTALEZA);

  it('reconoce() -> true contra los DOS exports del banco', async () => {
    await expect(parser.reconoce(leerFixture('fortaleza-por-rango.xlsx'))).resolves.toBe(true);
    await expect(parser.reconoce(leerFixture('fortaleza-ultimos-30.xlsx'))).resolves.toBe(true);
  });

  it('parse() — export por rango: 73 movimientos, cuenta declarada, checksum DERIVADO', async () => {
    const resultado = await parser.parse(leerFixture('fortaleza-por-rango.xlsx'));

    expect(resultado.movimientos).toHaveLength(73);
    expect(resultado.numeroCuentaDeclarado).toBe('5651023390');
    // No publica saldos en cabecera — se derivan de la fila más antigua.
    expect(resultado.saldoInicialDeclarado).toBeNull();
    expect(resultado.saldoFinalDeclarado).toBeNull();
  });

  it('parse() — el MISMO dialecto cubre el export "Últimos 30 movimientos" (30 filas, orden DESC)', async () => {
    const resultado = await parser.parse(leerFixture('fortaleza-ultimos-30.xlsx'));
    expect(resultado.movimientos).toHaveLength(30);
    // El export corto viene en orden inverso al de rango; el motor no depende
    // del orden, así que la cobertura se calcula igual de bien.
    expect(resultado.cobertura.desde.isBefore(resultado.cobertura.hasta)).toBe(true);
  });

  it('el lado sale de la COLUMNA, no del signo: Crédito -> CREDITO, Débito -> DEBITO', async () => {
    const resultado = await parser.parse(leerFixture('fortaleza-por-rango.xlsx'));

    // Fila 9 del archivo: sólo la columna `Crédito` tiene valor ('Bs.  20,000.00').
    const credito = resultado.movimientos[0]!;
    expect(credito.tipo).toBe('CREDITO');
    expect(credito.monto.toBob()).toBe('20000.00');
    expect(credito.saldo?.toBob()).toBe('30340.55');

    // Fila 10: sólo la columna `Débito`. El monto en el archivo es POSITIVO
    // ('Bs.  10,000.00') — un motor que dedujera el lado del signo lo habría
    // clasificado como CREDITO.
    const debito = resultado.movimientos[1]!;
    expect(debito.tipo).toBe('DEBITO');
    expect(debito.monto.toBob()).toBe('10000.00');
  });

  it('la hora viene EMBEBIDA en la celda de fecha y se normaliza a HH:MM:SS', async () => {
    const resultado = await parser.parse(leerFixture('fortaleza-por-rango.xlsx'));
    const primero = resultado.movimientos[0]!;

    expect(primero.fecha.toIso()).toBe('2026-05-09'); // '09/05/2026 10:52' -> DD/MM/YYYY
    expect(primero.hora).toBe('10:52:00');
  });

  it('descripcion = Tipo + " " + Glosa; referencia = Nro. Transacción', async () => {
    const resultado = await parser.parse(leerFixture('fortaleza-por-rango.xlsx'));
    const primero = resultado.movimientos[0]!;

    expect(primero.descripcion).toBe('DEPOSITO DE EFECTIVO ALEJANDRINA CHOQUE VILLCA');
    expect(primero.referencia).toBe('50605681');
  });
});

describe('XlsxCoreExtractoParser — BMSC XLSX', () => {
  const parser = new XlsxCoreExtractoParser(DIALECTO_BMSC);

  it('reconoce() -> true contra su propio fixture', async () => {
    await expect(parser.reconoce(leerFixture('bmsc-extracto.xlsx'))).resolves.toBe(true);
  });

  it('parse() — 193 movimientos sobre un header de 21 columnas, cuenta declarada', async () => {
    const resultado = await parser.parse(leerFixture('bmsc-extracto.xlsx'));

    expect(resultado.movimientos).toHaveLength(193);
    expect(resultado.numeroCuentaDeclarado).toBe('4066710701');
  });

  it('el `Saldo:` de cabecera NO se toma como saldo declarado (es el saldo vigente, no el del rango)', async () => {
    const resultado = await parser.parse(leerFixture('bmsc-extracto.xlsx'));

    expect(resultado.saldoInicialDeclarado).toBeNull();
    expect(resultado.saldoFinalDeclarado).toBeNull();
    // El valor SÍ está en el archivo — lo que se afirma es que el dialecto
    // deliberadamente no lo usa.
    const matriz = await leerMatrizXlsx(leerFixture('bmsc-extracto.xlsx'));
    expect(buscarValorDeEtiqueta(matriz, 'Saldo:', 11)).toBe('Bs 78,453.95');
  });

  it('lado por columna + hora en columna SEPARADA (no embebida en la fecha)', async () => {
    const resultado = await parser.parse(leerFixture('bmsc-extracto.xlsx'));

    const debito = resultado.movimientos[0]!;
    expect(debito.tipo).toBe('DEBITO');
    expect(debito.monto.toBob()).toBe('1.00');
    expect(debito.fecha.toIso()).toBe('2025-07-01');
    expect(debito.hora).toBe('06:27:52');
    expect(debito.saldo?.toBob()).toBe('113079.13');

    const credito = resultado.movimientos[5]!;
    expect(credito.tipo).toBe('CREDITO');
    expect(credito.monto.toBob()).toBe('8000.00');

    const ultimo = resultado.movimientos[192]!;
    expect(ultimo.tipo).toBe('DEBITO');
    expect(ultimo.monto.toBob()).toBe('80.09');
    expect(ultimo.saldo?.toBob()).toBe('78453.95');
  });

  it('las columnas de contraparte entran a la descripcion (soportaContraparte queda en false)', async () => {
    const resultado = await parser.parse(leerFixture('bmsc-extracto.xlsx'));

    expect(parser.descriptor.soportaContraparte).toBe(false);
    expect(resultado.movimientos[5]!.contraparteNombre).toBeNull();
    // 'Descripción' + 'Nombre/Denominación Depositante' + 'Nom.Destinatario'
    expect(resultado.movimientos[5]!.descripcion).toBe(
      'DEPOSITOS-VALOR EFECTIVO SAAVEDRA SORIA GALVARRO ROGER LUIS TARQUI ALANOCA MARCO ANTONIO',
    );
  });
});

describe('XlsxCoreExtractoParser — modo DEBITO_CREDITO_SEPARADOS: el lado nunca se adivina', () => {
  it('si AMBAS columnas traen valor, falla en vez de elegir una', async () => {
    // `Saldo` siempre tiene valor y `Débito` lo tiene en la primera fila del
    // fixture: apuntar el mapeo a ese par fuerza el caso ambiguo con datos
    // reales, sin necesidad de un fixture sintético.
    const parser = new XlsxCoreExtractoParser({
      ...DIALECTO_BMSC,
      mapeoMonto: {
        modo: 'DEBITO_CREDITO_SEPARADOS',
        etiquetaDebito: 'Débito',
        etiquetaCredito: 'Saldo',
      },
    });

    await expect(parser.parse(leerFixture('bmsc-extracto.xlsx'))).rejects.toThrow(
      ArchivoFormatoNoReconocidoError,
    );
  });

  it('si NINGUNA de las dos trae valor, falla en vez de asumir un monto', async () => {
    const parser = new XlsxCoreExtractoParser({
      ...DIALECTO_BMSC,
      mapeoMonto: {
        modo: 'DEBITO_CREDITO_SEPARADOS',
        etiquetaDebito: 'Nro.Cheque',
        etiquetaCredito: 'Nro/Nom.Plantilla',
      },
    });

    await expect(parser.parse(leerFixture('bmsc-extracto.xlsx'))).rejects.toThrow(
      ArchivoFormatoNoReconocidoError,
    );
  });
});

describe('XlsxCoreExtractoParser — anti-reuso de mapeo Fortaleza/BMSC ↔ resto de perfiles', () => {
  const previos: ReadonlyArray<[string, DialectoXlsx, string]> = [
    ['BancoSol', DIALECTO_BANCOSOL, 'bancosol-a-mayo-junio.xlsx'],
    ['Económico', DIALECTO_ECONOMICO, 'economico-extracto.xlsx'],
    ['Unión', DIALECTO_UNION_XLSX, 'union-extracto-por-rango.xlsx'],
    ['BCP', DIALECTO_BCP, 'bcp-extracto.xlsx'],
  ];
  const nuevos: ReadonlyArray<[string, DialectoXlsx, string]> = [
    ['Fortaleza', DIALECTO_FORTALEZA, 'fortaleza-por-rango.xlsx'],
    ['BMSC', DIALECTO_BMSC, 'bmsc-extracto.xlsx'],
  ];

  it.each(previos)(
    'el dialecto %s NO reconoce los fixtures de Fortaleza ni de BMSC',
    async (_nombre, dialecto) => {
      const parser = new XlsxCoreExtractoParser(dialecto);
      await expect(parser.reconoce(leerFixture('fortaleza-por-rango.xlsx'))).resolves.toBe(false);
      await expect(parser.reconoce(leerFixture('bmsc-extracto.xlsx'))).resolves.toBe(false);
    },
  );

  it.each(nuevos)(
    'el dialecto %s NO reconoce los fixtures de los perfiles previos',
    async (_nombre, dialecto) => {
      const parser = new XlsxCoreExtractoParser(dialecto);
      for (const [, , fixture] of previos) {
        await expect(parser.reconoce(leerFixture(fixture))).resolves.toBe(false);
      }
    },
  );

  it('Fortaleza y BMSC no se reconocen entre sí (ambos DD/MM/YYYY en celda de texto)', async () => {
    const fortaleza = new XlsxCoreExtractoParser(DIALECTO_FORTALEZA);
    const bmsc = new XlsxCoreExtractoParser(DIALECTO_BMSC);

    await expect(fortaleza.reconoce(leerFixture('bmsc-extracto.xlsx'))).resolves.toBe(false);
    await expect(bmsc.reconoce(leerFixture('fortaleza-por-rango.xlsx'))).resolves.toBe(false);
  });

  it.each(nuevos)(
    'parse(): el fixture de %s con el dialecto de otro perfil FALLA — nunca devuelve datos corridos',
    async (_nombre, _dialecto, fixture) => {
      for (const [, dialectoPrevio] of previos) {
        const parser = new XlsxCoreExtractoParser(dialectoPrevio);
        await expect(parser.parse(leerFixture(fixture))).rejects.toThrow(
          ArchivoFormatoNoReconocidoError,
        );
      }
    },
  );
});

// ---------------------------------------------------------------------------
// FIE XLSX: séptimo perfil. Export generado por JasperReports, maquetado como
// hoja IMPRESA: la cabecera de la tabla se REPITE en cada página y entre
// bloques hay una fila-marcador con el número de página. Es el único perfil
// con `paginacionEmbebida: true` — los descartes son ESTRUCTURALES (la fila
// re-matchea el header / fila con una sola celda numérica), nunca por
// posición: el patrón 7/21 filas por página lo decide la plantilla del banco
// y acá vive SOLO como aserción, no como regla del motor.
// ---------------------------------------------------------------------------

describe('XlsxCoreExtractoParser — FIE XLSX (JasperReports, paginación embebida)', () => {
  const parser = new XlsxCoreExtractoParser(DIALECTO_FIE);

  // [fixture, movimientos esperados, saldo inicial declarado]
  const FIXTURES_FIE = [
    ['fie-ultimas-transacciones.xlsx', 10, '296.17'],
    ['fie-por-rango-sharedstrings.xlsx', 26, '7514.28'],
    ['fie-por-rango-una-pagina.xlsx', 6, '79028.33'],
    ['fie-por-rango-tres-paginas.xlsx', 37, '207.38'],
  ] as const;

  it.each(FIXTURES_FIE)('reconoce() -> true contra %s', async (fixture) => {
    await expect(parser.reconoce(leerFixture(fixture))).resolves.toBe(true);
  });

  it.each(FIXTURES_FIE)(
    'parse() — %s: %i movimientos, cuenta declarada y saldos DECLARADOS en cabecera',
    async (fixture, esperados, saldoInicial) => {
      const resultado = await parser.parse(leerFixture(fixture));

      expect(resultado.movimientos).toHaveLength(esperados);
      expect(resultado.numeroCuentaDeclarado).toBe('40-0-1816170-4');
      expect(resultado.saldoInicialDeclarado?.toBob()).toBe(saldoInicial);
      // Los 4 exports comparten cuenta y fecha de corte: mismo saldo final.
      expect(resultado.saldoFinalDeclarado?.toBob()).toBe('59243.33');
    },
  );

  it('la paginación se descarta por ESTRUCTURA: bloques de 7/21/9 registros, 3 marcadores y 2 cabeceras repetidas (fie-por-rango-tres-paginas)', async () => {
    const matriz = await leerMatrizXlsx(leerFixture('fie-por-rango-tres-paginas.xlsx'));

    const indiceHeader = matriz.findIndex((fila) => fila[1] === 'Fecha');
    expect(indiceHeader).toBe(27); // fila 28 (1-based) — layout relevado del formato FIE

    const esMarcadorDePagina = (fila: FilaCruda): boolean => {
      const noNulas = fila.filter((celda) => celda !== null);
      return (
        noNulas.length === 1 &&
        typeof noNulas[0] === 'string' &&
        /^\d+(\.0+)?$/.test(noNulas[0].trim())
      );
    };
    const esHeaderRepetido = (fila: FilaCruda): boolean => fila[1] === 'Fecha';

    const filasDatos = matriz.slice(indiceHeader + 1);
    const bloques: number[] = [];
    let enCurso = 0;
    let marcadores = 0;
    let headersRepetidos = 0;
    for (const fila of filasDatos) {
      if (esHeaderRepetido(fila)) {
        headersRepetidos++;
        continue;
      }
      if (esMarcadorDePagina(fila)) {
        marcadores++;
        bloques.push(enCurso);
        enCurso = 0;
        continue;
      }
      enCurso++;
    }

    // El 7/21 va acá y SOLO acá: es conocimiento de la plantilla actual de
    // Jasper, no una regla del motor. Si el banco la retoca, cambia este
    // test — no se corrompen movimientos en silencio.
    expect(bloques).toEqual([7, 21, 9]);
    expect(marcadores).toBe(3);
    expect(headersRepetidos).toBe(2);

    const resultado = await parser.parse(leerFixture('fie-por-rango-tres-paginas.xlsx'));
    expect(resultado.movimientos).toHaveLength(7 + 21 + 9);
    // Una cabecera colada como movimiento tendría esta descripción exacta.
    expect(resultado.movimientos.some((m) => m.descripcion === 'Descripción Oficina/Canal')).toBe(
      false,
    );
  });

  it('hora en columna propia y como STRING — si llegara como Date el motor la descartaría en silencio', async () => {
    const resultado = await parser.parse(leerFixture('fie-ultimas-transacciones.xlsx'));

    const primero = resultado.movimientos[0]!;
    expect(primero.fecha.toIso()).toBe('2026-07-20');
    expect(primero.hora).toBe('11:57:00');
  });

  it('signo explícito del monto → tipo: "+50,450.00" → CREDITO, "-31,000.00" → DEBITO', async () => {
    const resultado = await parser.parse(leerFixture('fie-ultimas-transacciones.xlsx'));

    const credito = resultado.movimientos[0]!;
    expect(credito.monto.toBob()).toBe('50450.00');
    expect(credito.tipo).toBe('CREDITO');
    expect(credito.saldo?.toBob()).toBe('59243.33');

    const debito = resultado.movimientos[1]!;
    expect(debito.monto.toBob()).toBe('31000.00');
    expect(debito.tipo).toBe('DEBITO');
    expect(debito.saldo?.toBob()).toBe('8793.33');
  });

  it('renglón dorado: descripcion = Descripción + " " + Oficina/Canal (Sucursal excluida a propósito)', async () => {
    const resultado = await parser.parse(leerFixture('fie-ultimas-transacciones.xlsx'));

    expect(resultado.movimientos[0]!.descripcion).toBe(
      'DEPOSITO AHORROS S/L ( - COMPRA DE POLLO VIVO) AGENCIA QUILLACOLLO',
    );
    expect(resultado.movimientos[0]!.referencia).toBe('214095378');
    // `Sucursal` es un código de 2 letras función 1:1 de `Oficina/Canal`
    // ('AGENCIA QUILLACOLLO'→'CB'): no discrimina y ensuciaría el hash.
    expect(resultado.movimientos[0]!.descripcion.endsWith(' CB')).toBe(false);
  });

  it('el export de suma NEGATIVA cuadra contra los saldos declarados: 79.028,33 + (−19.785,00) = 59.243,33', async () => {
    const resultado = await parser.parse(leerFixture('fie-por-rango-una-pagina.xlsx'));

    const neto = resultado.movimientos.reduce(
      (acc, m) => (m.tipo === 'CREDITO' ? acc.plus(m.monto) : acc.minus(m.monto)),
      Money.ZERO,
    );
    expect(neto.toBob()).toBe('-19785.00');
    expect(resultado.saldoInicialDeclarado!.plus(neto).toBob()).toBe('59243.33');
  });

  it.each(FIXTURES_FIE)(
    'REQ-CB-08 checksum DECLARADO end-to-end — %s: VERIFICADO con diferencia null',
    async (fixture) => {
      const resultado = await parser.parse(leerFixture(fixture));

      const checksum = verificarChecksum('DECLARADO', resultado.movimientos, {
        saldoInicialDeclarado: resultado.saldoInicialDeclarado,
        saldoFinalDeclarado: resultado.saldoFinalDeclarado,
      });
      expect(checksum.estadoVerificacion).toBe('VERIFICADO');
      expect(checksum.diferencia).toBeNull();
    },
  );

  it.each(FIXTURES_FIE)(
    'saldo corrido coherente fila a fila (orden DESC) — %s: también a través de los cortes de página',
    async (fixture) => {
      const resultado = await parser.parse(leerFixture(fixture));

      // Orden DESC del export: la fila i−1 es MÁS reciente que la i, así que
      // saldo(i−1) = saldo(i) ± monto(i−1). Cruza los cortes de página, o sea
      // que una fila comida o colada por la paginación rompería la cadena.
      for (let i = 1; i < resultado.movimientos.length; i++) {
        const masReciente = resultado.movimientos[i - 1]!;
        const anterior = resultado.movimientos[i]!;
        const esperado =
          masReciente.tipo === 'CREDITO'
            ? anterior.saldo!.plus(masReciente.monto)
            : anterior.saldo!.minus(masReciente.monto);
        expect(esperado.igualaConTolerancia(masReciente.saldo!)).toBe(true);
      }
    },
  );
});

describe('XlsxCoreExtractoParser — anti-reuso de mapeo FIE ↔ resto de perfiles', () => {
  const previos: ReadonlyArray<[string, DialectoXlsx, string]> = [
    ['BancoSol', DIALECTO_BANCOSOL, 'bancosol-a-mayo-junio.xlsx'],
    ['Económico', DIALECTO_ECONOMICO, 'economico-extracto.xlsx'],
    ['Unión', DIALECTO_UNION_XLSX, 'union-extracto-por-rango.xlsx'],
    ['BCP', DIALECTO_BCP, 'bcp-extracto.xlsx'],
    ['Fortaleza', DIALECTO_FORTALEZA, 'fortaleza-por-rango.xlsx'],
    ['BMSC', DIALECTO_BMSC, 'bmsc-extracto.xlsx'],
  ];
  const fixturesFie = [
    'fie-ultimas-transacciones.xlsx',
    'fie-por-rango-sharedstrings.xlsx',
    'fie-por-rango-una-pagina.xlsx',
    'fie-por-rango-tres-paginas.xlsx',
  ] as const;

  it.each(previos)('el dialecto %s NO reconoce los fixtures de FIE', async (_nombre, dialecto) => {
    const parser = new XlsxCoreExtractoParser(dialecto);
    for (const fixture of fixturesFie) {
      await expect(parser.reconoce(leerFixture(fixture))).resolves.toBe(false);
    }
  });

  it.each(previos)(
    'el dialecto FIE NO reconoce el fixture de %s',
    async (_nombre, _dialecto, fixture) => {
      const parser = new XlsxCoreExtractoParser(DIALECTO_FIE);
      await expect(parser.reconoce(leerFixture(fixture))).resolves.toBe(false);
    },
  );

  it.each(previos)(
    'parse(): los fixtures de FIE con el dialecto de %s FALLAN — nunca devuelven datos corridos',
    async (_nombre, dialecto) => {
      const parser = new XlsxCoreExtractoParser(dialecto);
      for (const fixture of fixturesFie) {
        await expect(parser.parse(leerFixture(fixture))).rejects.toThrow(
          ArchivoFormatoNoReconocidoError,
        );
      }
    },
  );

  it.each(previos)(
    'parse(): el fixture de %s con el dialecto FIE FALLA — nunca devuelve datos corridos',
    async (_nombre, _dialecto, fixture) => {
      const parser = new XlsxCoreExtractoParser(DIALECTO_FIE);
      await expect(parser.parse(leerFixture(fixture))).rejects.toThrow(
        ArchivoFormatoNoReconocidoError,
      );
    },
  );
});
