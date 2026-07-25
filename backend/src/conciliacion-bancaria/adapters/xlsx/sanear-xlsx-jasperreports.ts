/**
 * Saneador de `.xlsx` generados por JasperReports (extractos del banco FIE).
 *
 * Esos archivos traen dos malformaciones que `read-excel-file` no tolera:
 *
 * 1. Celdas `<c ... t="inlineStr"></c>` SIN hijo `<is>`. Es OOXML legal, pero
 *    la rama `inlineStr` de `parseCellValue` LANZA (`Couldn't read "inline
 *    string" cell value`) en vez de devolver `null` como hace la rama
 *    numérica. Verificado también contra 9.3.4: el fix de esa versión cubrió
 *    la rama `str`, no `inlineStr`.
 * 2. `<dimension ref="A1"/>` mentiroso: declara UNA celda usada cuando la
 *    hoja tiene decenas de filas. Aunque se arregle el punto 1, con ese
 *    `dimension` `read-excel-file` devuelve cero filas SIN error — fallo
 *    silencioso.
 *
 * El saneo es quirúrgico y conservador: solo toca `xl/worksheets/sheetN.xml`;
 * sharedStrings, estilos, drawings, media y `[Content_Types].xml` pasan
 * intactos. Sobre un archivo ya sano es un no-op semántico.
 */
import { strToU8, unzipSync, zipSync } from 'fflate';

const WORKSHEET_RE = /^xl\/worksheets\/sheet\d+\.xml$/;

// La forma AUTO-CERRADA va PRIMERO en la alternancia: si la forma pareada
// fuera primero, `<c .../>` matchearía como tag de apertura y el `[\s\S]*?</c>`
// se tragaría la celda siguiente, corriendo todas las columnas de la fila.
const CELDA_RE = /<c\b[^>]*?\/>|<c\b[^>]*?>[\s\S]*?<\/c>/g;

const ATTR_INLINE_STR_RE = /\s+t=(?:"inlineStr"|'inlineStr')/;
const REF_CELDA_RE = /^<c\b[^>]*?\br=(?:"([A-Z]+)(\d+)"|'([A-Z]+)(\d+)')/;
const DIMENSION_RE = /<dimension\b[^>]*?\/>|<dimension\b[^>]*?>[\s\S]*?<\/dimension>/;

function indiceDeColumna(letras: string): number {
  // Base 26 sin cero: A=1 … Z=26, AA=27. Comparar strings ordenaría Z > AA.
  return [...letras].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
}

function letrasDeColumna(indice: number): string {
  let restante = indice;
  let letras = '';
  while (restante > 0) {
    letras = String.fromCharCode(65 + ((restante - 1) % 26)) + letras;
    restante = Math.floor((restante - 1) / 26);
  }
  return letras;
}

function quitarInlineStrVacias(xml: string): string {
  return xml.replace(CELDA_RE, (celda) => {
    if (!ATTR_INLINE_STR_RE.test(celda)) return celda;
    if (celda.includes('<is')) return celda;
    // Sin el atributo `t`, la celda vacía pasa a ser numérica-vacía y
    // `read-excel-file` la devuelve como `null` — que es lo que
    // semánticamente es — en lugar de lanzar.
    return celda.replace(ATTR_INLINE_STR_RE, '');
  });
}

function recalcularDimension(xml: string): string {
  if (!DIMENSION_RE.test(xml)) return xml;

  let maxColumna = 0;
  let maxFila = 0;
  for (const celda of xml.match(CELDA_RE) ?? []) {
    const ref = REF_CELDA_RE.exec(celda);
    if (!ref) continue;
    const letras = ref[1] ?? ref[3];
    const fila = ref[2] ?? ref[4];
    if (letras === undefined || fila === undefined) continue;
    maxColumna = Math.max(maxColumna, indiceDeColumna(letras));
    maxFila = Math.max(maxFila, Number(fila));
  }
  if (maxColumna === 0 || maxFila === 0) return xml;

  const ref = `A1:${letrasDeColumna(maxColumna)}${maxFila}`;
  return xml.replace(DIMENSION_RE, `<dimension ref="${ref}"/>`);
}

/**
 * Aplica los dos parches sobre el XML de UNA hoja. Expuesto aparte para poder
 * testear el recálculo de `dimension` y el manejo de celdas de forma aislada.
 */
export function sanearHojaXml(xml: string): string {
  return recalcularDimension(quitarInlineStrVacias(xml));
}

/**
 * Sanea un `.xlsx` de JasperReports para que `read-excel-file` pueda leerlo.
 * Idempotente: sobre un archivo sano devuelve un zip con contenido idéntico.
 * Conservador: solo reescribe los `xl/worksheets/sheetN.xml` que cambian.
 */
export function sanearXlsxJasperReports(archivo: Buffer): Buffer {
  const entradas = unzipSync(new Uint8Array(archivo));

  const saneadas: Record<string, Uint8Array> = {};
  for (const [nombre, contenido] of Object.entries(entradas)) {
    if (!WORKSHEET_RE.test(nombre)) {
      saneadas[nombre] = contenido;
      continue;
    }
    const xml = Buffer.from(contenido).toString('utf8');
    const saneado = sanearHojaXml(xml);
    saneadas[nombre] = saneado === xml ? contenido : strToU8(saneado);
  }

  return Buffer.from(zipSync(saneadas));
}
