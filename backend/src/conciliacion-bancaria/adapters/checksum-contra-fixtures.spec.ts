/**
 * Regresión de checksum sobre TODOS los extractos reales, para los 6 perfiles.
 *
 * Este es el test que faltaba. Los specs de cada dialecto verificaban conteo
 * de movimientos, lados, fechas y descripciones — nadie corría el checksum
 * de punta a punta sobre los fixtures, así que un ancla de saldo mal elegida
 * pasaba invisible. El bug real: el checksum DERIVADO consumía la lista en
 * orden CANÓNICO (que desempata por monto, no por hora) y anclaba el saldo en
 * el movimiento equivocado cuando el día más antiguo tenía varios
 * movimientos. Reportaba `DESCUADRE Bs 95.000` sobre el export "Últimos 30"
 * de Fortaleza, con los 30 movimientos perfectamente importados.
 *
 * Los demás perfiles DERIVADO no lo exhibían por casualidad estructural (día
 * más antiguo con un solo movimiento, o con el de menor monto primero), de
 * ahí que este archivo recorra TODOS los fixtures y no solo el que falló.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { verificarChecksum } from '../domain/checksum-extracto';
import { ordenarCanonico } from '../domain/orden-canonico';
import { ordenarCronologico } from '../domain/orden-cronologico';
import { DIALECTO_BANCOSOL } from './dialectos/bancosol.dialecto';
import { DIALECTO_BCP } from './dialectos/bcp.dialecto';
import { DIALECTO_BMSC } from './dialectos/bmsc.dialecto';
import type { DialectoXlsx } from './dialectos/dialecto-xlsx';
import { DIALECTO_ECONOMICO } from './dialectos/economico.dialecto';
import { DIALECTO_FORTALEZA } from './dialectos/fortaleza.dialecto';
import { DIALECTO_UNION_XLSX } from './dialectos/union.dialecto';
import { XlsxCoreExtractoParser } from './xlsx-core-extracto-parser';

const FIXTURES_DIR = join(__dirname, '__fixtures__');

function leerFixture(nombre: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, nombre));
}

const TODOS: ReadonlyArray<[string, DialectoXlsx, string]> = [
  ['BancoSol — 20 movimientos', DIALECTO_BANCOSOL, 'bancosol-20-movimientos-checksum.xlsx'],
  ['BancoSol — mayo/junio', DIALECTO_BANCOSOL, 'bancosol-a-mayo-junio.xlsx'],
  ['BancoSol — junio/julio', DIALECTO_BANCOSOL, 'bancosol-b-junio-julio.xlsx'],
  ['Económico', DIALECTO_ECONOMICO, 'economico-extracto.xlsx'],
  ['Unión — por rango', DIALECTO_UNION_XLSX, 'union-extracto-por-rango.xlsx'],
  ['BCP', DIALECTO_BCP, 'bcp-extracto.xlsx'],
  ['Fortaleza — por rango', DIALECTO_FORTALEZA, 'fortaleza-por-rango.xlsx'],
  ['Fortaleza — últimos 30', DIALECTO_FORTALEZA, 'fortaleza-ultimos-30.xlsx'],
  ['BMSC — julio/septiembre', DIALECTO_BMSC, 'bmsc-extracto.xlsx'],
  ['BMSC — marzo/mayo', DIALECTO_BMSC, 'bmsc-marzo-mayo.xlsx'],
];

describe('Checksum contra los extractos reales — los 6 perfiles cuadran', () => {
  it.each(TODOS)('%s: VERIFICADO', async (_nombre, dialecto, fixture) => {
    const parseado = await new XlsxCoreExtractoParser(dialecto).parse(leerFixture(fixture));
    const cronologico = ordenarCronologico(parseado.movimientos);

    expect(cronologico).not.toBeNull();

    const resultado = verificarChecksum(dialecto.estrategiaChecksum, cronologico!, {
      saldoInicialDeclarado: parseado.saldoInicialDeclarado,
      saldoFinalDeclarado: parseado.saldoFinalDeclarado,
    });

    expect(resultado.estadoVerificacion).toBe('VERIFICADO');
    expect(resultado.diferencia).toBeNull();
  });
});

describe('Checksum — el orden canónico NO sirve para anclar el saldo (bug de origen)', () => {
  it('el export "Últimos 30" de Fortaleza descuadra Bs 95.000 con orden canónico y cuadra con el cronológico', async () => {
    const parseado = await new XlsxCoreExtractoParser(DIALECTO_FORTALEZA).parse(
      leerFixture('fortaleza-ultimos-30.xlsx'),
    );
    const datos = {
      saldoInicialDeclarado: parseado.saldoInicialDeclarado,
      saldoFinalDeclarado: parseado.saldoFinalDeclarado,
    };

    // Reproduce el bug exacto reportado desde la app.
    const conCanonico = verificarChecksum('DERIVADO', ordenarCanonico(parseado.movimientos), datos);
    expect(conCanonico.estadoVerificacion).toBe('DESCUADRE');
    // 95.000 = 45.000 + 50.000, los otros dos créditos del 24/06 que quedaron
    // "antes" del ancla porque el canónico ordena ese día por monto.
    expect(conCanonico.diferencia?.toBob()).toBe('95000.00');

    const conCronologico = verificarChecksum(
      'DERIVADO',
      ordenarCronologico(parseado.movimientos)!,
      datos,
    );
    expect(conCronologico.estadoVerificacion).toBe('VERIFICADO');
  });

  it('los dos exports de Fortaleza cubren días compartidos y dan el MISMO veredicto', async () => {
    const parser = new XlsxCoreExtractoParser(DIALECTO_FORTALEZA);

    for (const fixture of ['fortaleza-por-rango.xlsx', 'fortaleza-ultimos-30.xlsx']) {
      const parseado = await parser.parse(leerFixture(fixture));
      const resultado = verificarChecksum('DERIVADO', ordenarCronologico(parseado.movimientos)!, {
        saldoInicialDeclarado: null,
        saldoFinalDeclarado: null,
      });
      expect(resultado.estadoVerificacion).toBe('VERIFICADO');
    }
  });
});

describe('Checksum — BMSC también estaba afectado, no solo Fortaleza', () => {
  it('el extracto de marzo/mayo descuadra Bs 40.164,23 con orden canónico y cuadra con el cronológico', async () => {
    // Segundo caso REAL del mismo bug, reportado desde la app con un archivo
    // distinto y un número distinto. Importa porque el otro fixture de BMSC
    // (julio/septiembre) cuadraba por casualidad — abre su día más antiguo con
    // un débito de Bs 1,00, que al ser el de menor monto es también el primero
    // del orden canónico. Sin este fixture, BMSC parecía sano.
    const parseado = await new XlsxCoreExtractoParser(DIALECTO_BMSC).parse(
      leerFixture('bmsc-marzo-mayo.xlsx'),
    );
    const datos = { saldoInicialDeclarado: null, saldoFinalDeclarado: null };

    expect(parseado.movimientos).toHaveLength(143);

    const conCanonico = verificarChecksum('DERIVADO', ordenarCanonico(parseado.movimientos), datos);
    expect(conCanonico.estadoVerificacion).toBe('DESCUADRE');
    expect(conCanonico.diferencia?.toBob()).toBe('40164.23');

    const conCronologico = verificarChecksum(
      'DERIVADO',
      ordenarCronologico(parseado.movimientos)!,
      datos,
    );
    expect(conCronologico.estadoVerificacion).toBe('VERIFICADO');
  });
});
