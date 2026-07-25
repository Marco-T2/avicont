/**
 * El banco FIE exporta sus extractos con JasperReports (firma:
 * `JR_PAGE_ANCHOR_0_1` en `xl/workbook.xml`) y esos archivos traen DOS
 * malformaciones que `read-excel-file` no tolera:
 *
 * 1. Celdas `<c ... t="inlineStr"></c>` SIN hijo `<is>` — OOXML legal, pero
 *    la rama `inlineStr` de `parseCellValue` LANZA en vez de devolver null.
 * 2. `<dimension ref="A1"/>` mentiroso — declara una sola celda usada cuando
 *    la hoja tiene decenas de filas; consecuencia: cero filas SIN error.
 *
 * Estos tests fijan el contrato del saneador: los 3 fixtures malformados
 * pasan de LANZAR a leerse completos, y el fixture sano queda intacto
 * (idempotencia semántica).
 */
import { unzipSync, strToU8, zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// El "antes del saneo" se demuestra contra el lector CRUDO: `leerMatrizXlsx`
// ya trae el saneo cableado (puerta única, universal para todos los perfiles).
import readXlsxFile from 'read-excel-file/node';

import { leerMatrizXlsx } from './leer-matriz-xlsx';
import { sanearHojaXml, sanearXlsxJasperReports } from './sanear-xlsx-jasperreports';

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

function leerFixture(nombre: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, nombre));
}

describe('sanearXlsxJasperReports', () => {
  describe('archivos FIE malformados (inlineStr vacías + dimension mentiroso)', () => {
    it.each([
      ['fie-ultimas-transacciones.xlsx', 41],
      ['fie-por-rango-una-pagina.xlsx', 35],
      ['fie-por-rango-tres-paginas.xlsx', 70],
    ])(
      '%s: el lector crudo LANZA; leerMatrizXlsx (saneo cableado) devuelve %i filas',
      async (nombre, filasEsperadas) => {
        const original = leerFixture(nombre);

        await expect(readXlsxFile(original)).rejects.toThrow(
          'Couldn\'t read "inline string" cell value',
        );

        const matriz = await leerMatrizXlsx(original);

        expect(matriz.length).toBe(filasEsperadas);
      },
    );

    it('el contenido saneado trae los rótulos reales del extracto, no solo filas vacías', async () => {
      const matriz = await leerMatrizXlsx(leerFixture('fie-por-rango-una-pagina.xlsx'));

      const celdas = matriz.flat().filter((c) => typeof c === 'string');
      expect(celdas.length).toBeGreaterThan(0);
      expect(celdas.some((c) => /fecha/i.test(c))).toBe(true);
    });
  });

  describe('archivo FIE sano (con sharedStrings y dimension correcto)', () => {
    it('el saneo es un no-op semántico: mismas filas y mismos valores antes y después', async () => {
      const original = leerFixture('fie-por-rango-sharedstrings.xlsx');

      const antes = await leerMatrizXlsx(original);
      const despues = await leerMatrizXlsx(sanearXlsxJasperReports(original));

      expect(antes.length).toBe(57);
      expect(despues).toEqual(antes);
    });
  });

  describe('conservación del resto del zip', () => {
    it('las entradas que no son worksheets sobreviven byte a byte (estilos, media, sharedStrings, Content_Types)', () => {
      const original = leerFixture('fie-ultimas-transacciones.xlsx');
      const saneado = sanearXlsxJasperReports(original);

      const entradasOriginales = unzipSync(new Uint8Array(original));
      const entradasSaneadas = unzipSync(new Uint8Array(saneado));

      expect(Object.keys(entradasSaneadas).sort()).toEqual(Object.keys(entradasOriginales).sort());

      for (const [nombre, contenido] of Object.entries(entradasOriginales)) {
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(nombre)) continue;
        expect(Buffer.from(entradasSaneadas[nombre] ?? new Uint8Array())).toEqual(
          Buffer.from(contenido),
        );
      }
    });

    it('en un archivo ya sano, incluso los worksheets quedan byte a byte idénticos', () => {
      const original = leerFixture('fie-por-rango-sharedstrings.xlsx');
      const saneado = sanearXlsxJasperReports(original);

      const entradasOriginales = unzipSync(new Uint8Array(original));
      const entradasSaneadas = unzipSync(new Uint8Array(saneado));

      for (const [nombre, contenido] of Object.entries(entradasOriginales)) {
        expect(Buffer.from(entradasSaneadas[nombre] ?? new Uint8Array())).toEqual(
          Buffer.from(contenido),
        );
      }
    });
  });

  /**
   * El saneo corre en la puerta única de `leerMatrizXlsx`: los 7 perfiles, dos
   * veces por importación (`reconoce()` + `parse()`). Que un archivo sano NO se
   * re-zipee es lo que deja a los otros seis bancos fuera del round-trip de
   * fflate — que descarta metadata del zip — y les ahorra un `zipSync` síncrono
   * del archivo entero. Es contrato, no detalle de implementación.
   */
  describe('el archivo sano NO se re-zipea (idempotencia literal)', () => {
    it.each([
      'fie-por-rango-sharedstrings.xlsx',
      'bancosol-a-mayo-junio.xlsx',
      'economico-extracto.xlsx',
      'union-extracto-por-rango.xlsx',
      'fortaleza-por-rango.xlsx',
      'bmsc-extracto.xlsx',
    ])('%s: devuelve el MISMO buffer, sin pasar por zipSync', (nombre) => {
      const original = leerFixture(nombre);

      expect(sanearXlsxJasperReports(original)).toBe(original);
    });

    it('en cambio un archivo malformado SÍ produce un buffer nuevo', () => {
      const original = leerFixture('fie-ultimas-transacciones.xlsx');

      expect(sanearXlsxJasperReports(original)).not.toBe(original);
    });

    /**
     * BCP es el único perfil sano que SÍ se toca, y la conducta es la misma que
     * traía el saneo desde el PR #253: declara `<dimension ref="B1:AB42"/>`
     * teniendo celdas en la columna A, y el rango emitido ancla en A1. Se
     * congela acá para que no se lo confunda con un archivo intacto ni se lo
     * "arregle" cambiándole el parseo a un perfil que hoy funciona.
     */
    it('bcp-extracto.xlsx: se amplía a la izquierda (declara B1 con celdas en la columna A)', () => {
      const original = leerFixture('bcp-extracto.xlsx');

      const saneado = sanearXlsxJasperReports(original);

      expect(saneado).not.toBe(original);
      const hoja = Buffer.from(
        unzipSync(new Uint8Array(saneado))['xl/worksheets/sheet1.xml'] ?? new Uint8Array(),
      ).toString('utf8');
      expect(hoja).toContain('<dimension ref="A1:AB42"/>');
    });
  });
});

describe('sanearHojaXml (parches a nivel XML, aislados)', () => {
  it('recalcula <dimension> a partir de las refs reales de las celdas', () => {
    const xml =
      '<worksheet><dimension ref="A1"/><sheetData>' +
      '<row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>2</v></c></row>' +
      '<row r="9"><c r="B9"><v>3</v></c></row>' +
      '</sheetData></worksheet>';

    expect(sanearHojaXml(xml)).toContain('<dimension ref="A1:C9"/>');
  });

  it('columna máxima: AA gana sobre Z (comparación numérica, no de strings)', () => {
    const xml =
      '<worksheet><dimension ref="A1"/><sheetData>' +
      '<row r="1"><c r="AA1"><v>1</v></c><c r="Z1"><v>2</v></c></row>' +
      '</sheetData></worksheet>';

    expect(sanearHojaXml(xml)).toContain('<dimension ref="A1:AA1"/>');
  });

  /**
   * El recálculo AMPLÍA, nunca achica ni normaliza. Reemplazar a ciegas rompía
   * hojas sanas que declaran filas sin celdas `<c>`: el extracto de Unión
   * declara `A1:AD46` con celdas hasta la 45, y el recálculo puro le comía la
   * última fila — la falla de FIE al revés, sobre un archivo que estaba bien.
   */
  describe('el <dimension> declarado se AMPLÍA, nunca se achica', () => {
    it('declarado más ancho que las celdas: queda intacto (no se achica)', () => {
      const xml =
        '<worksheet><dimension ref="A1:AD46"/><sheetData>' +
        '<row r="45"><c r="AD45"><v>1</v></c></row>' +
        '</sheetData></worksheet>';

      expect(sanearHojaXml(xml)).toBe(xml);
    });

    it('declarado exacto pero con otro formato: no se normaliza el tag (cero churn)', () => {
      // BancoSol declara `<dimension ref="A1:N77" />`, con espacio antes del
      // cierre. Reescribirlo obligaría a re-zipear un archivo que está sano.
      const xml =
        '<worksheet><dimension ref="A1:B2" /><sheetData>' +
        '<row r="2"><c r="B2"><v>1</v></c></row>' +
        '</sheetData></worksheet>';

      expect(sanearHojaXml(xml)).toBe(xml);
    });

    it('unión por eje: se toma el máximo declarado/real en cada dimensión', () => {
      // Declarado corto en filas (2 < 9) y largo en columnas (D > B).
      const xml =
        '<worksheet><dimension ref="A1:D2"/><sheetData>' +
        '<row r="9"><c r="B9"><v>1</v></c></row>' +
        '</sheetData></worksheet>';

      expect(sanearHojaXml(xml)).toContain('<dimension ref="A1:D9"/>');
    });

    it('declarado que arranca fuera de A1 y deja celdas afuera: se amplía a la izquierda', () => {
      // BCP declara `B1:AB42` teniendo celdas en la columna A.
      const xml =
        '<worksheet><dimension ref="B1:C2"/><sheetData>' +
        '<row r="2"><c r="A2"><v>1</v></c><c r="C2"><v>2</v></c></row>' +
        '</sheetData></worksheet>';

      expect(sanearHojaXml(xml)).toContain('<dimension ref="A1:C2"/>');
    });
  });

  it('quita t="inlineStr" SOLO a las celdas sin hijo <is> (formas pareada y auto-cerrada)', () => {
    const xml =
      '<worksheet><dimension ref="A1:C1"/><sheetData><row r="1">' +
      '<c r="A1" s="1" t="inlineStr"></c>' +
      '<c r="B1" t="inlineStr"/>' +
      '<c r="C1" t="inlineStr"><is><t>hola</t></is></c>' +
      '</row></sheetData></worksheet>';

    const saneado = sanearHojaXml(xml);

    expect(saneado).toContain('<c r="A1" s="1"></c>');
    expect(saneado).toContain('<c r="B1"/>');
    expect(saneado).toContain('<c r="C1" t="inlineStr"><is><t>hola</t></is></c>');
  });

  it('una celda auto-cerrada NO se traga a la celda siguiente (orden de la alternancia del regex)', () => {
    // Error real cometido durante el diagnóstico: con la forma pareada primero
    // en la alternancia, `<c .../>` matcheaba como apertura y el `[\s\S]*?</c>`
    // se tragaba la celda vecina, corriendo todas las columnas.
    const xml =
      '<worksheet><dimension ref="A1:B1"/><sheetData><row r="1">' +
      '<c r="A1" s="2"/>' +
      '<c r="B1" t="inlineStr"><is><t>sobrevive</t></is></c>' +
      '</row></sheetData></worksheet>';

    const saneado = sanearHojaXml(xml);

    expect(saneado).toContain('<c r="A1" s="2"/>');
    expect(saneado).toContain('<c r="B1" t="inlineStr"><is><t>sobrevive</t></is></c>');
  });

  it('sin tag <dimension> no inventa uno (conservador)', () => {
    const xml =
      '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>';

    expect(sanearHojaXml(xml)).toBe(xml);
  });
});

describe('sanearXlsxJasperReports con un zip sintético', () => {
  it('un xlsx mínimo malformado se vuelve legible y las filas quedan donde corresponde', async () => {
    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';
    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
    const workbook =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const workbookRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';
    const styles =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="1"><font/></fonts><fills count="1"><fill/></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
      '<cellXfs count="1"><xf/></cellXfs></styleSheet>';
    const sheet =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1"/><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"></c><c r="B1" t="inlineStr"><is><t>Fecha</t></is></c></row>' +
      '<row r="3"><c r="B3" t="inlineStr"><is><t>dato</t></is></c></row>' +
      '</sheetData></worksheet>';

    const sintetico = Buffer.from(
      zipSync({
        '[Content_Types].xml': strToU8(contentTypes),
        '_rels/.rels': strToU8(rels),
        'xl/workbook.xml': strToU8(workbook),
        'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
        'xl/styles.xml': strToU8(styles),
        'xl/worksheets/sheet1.xml': strToU8(sheet),
      }),
    );

    await expect(readXlsxFile(sintetico)).rejects.toThrow();

    const matriz = await leerMatrizXlsx(sintetico);

    expect(matriz.length).toBe(3);
    expect(matriz[0]?.[1]).toBe('Fecha');
    expect(matriz[2]?.[1]).toBe('dato');
  });
});
