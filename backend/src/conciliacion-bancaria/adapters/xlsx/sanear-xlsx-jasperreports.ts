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
const REF_DIMENSION_RE = /\bref=(?:"([^"]*)"|'([^']*)')/;

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

interface Esquina {
  readonly columna: number;
  readonly fila: number;
}

function parsearEsquina(celda: string): Esquina | null {
  const m = /^([A-Z]+)(\d+)$/.exec(celda);
  const letras = m?.[1];
  const fila = m?.[2];
  if (letras === undefined || fila === undefined) return null;
  return { columna: indiceDeColumna(letras), fila: Number(fila) };
}

/** Esquinas del `ref` de un `<dimension>` (`A1` o `A1:N77`). Null si no se puede leer. */
function esquinasDeclaradas(tagDimension: string): { inicio: Esquina; fin: Esquina } | null {
  const ref = REF_DIMENSION_RE.exec(tagDimension);
  const valor = ref?.[1] ?? ref?.[2];
  if (valor === undefined) return null;

  const partes = valor.split(':');
  const crudoInicio = partes[0];
  const crudoFin = partes[partes.length - 1];
  if (crudoInicio === undefined || crudoFin === undefined) return null;

  const inicio = parsearEsquina(crudoInicio);
  const fin = parsearEsquina(crudoFin);
  if (inicio === null || fin === null) return null;

  return { inicio, fin };
}

/**
 * Corrige el `<dimension>` cuando NO cubre las celdas reales de la hoja (el
 * `<dimension ref="A1"/>` mentiroso de JasperReports).
 *
 * Toma la UNIÓN de lo declarado y lo que exigen las celdas — nunca reemplaza a
 * ciegas. Reemplazar achicaría el rango en hojas sanas que declaran filas sin
 * celdas `<c>`: el extracto de Unión declara `A1:AD46` y sus celdas solo llegan
 * a la 45, así que un recálculo puro le comería la última fila. Eso es la falla
 * de FIE al revés, aplicada a un archivo que estaba bien.
 *
 * Si el rango declarado ya cubre todo, el XML sale intacto: no se normaliza el
 * tag por formato (BancoSol declara `<dimension ref="A1:N77" />`, con espacio
 * antes del cierre, y reescribirlo sería churn sin ningún efecto).
 */
function recalcularDimension(xml: string): string {
  const tag = DIMENSION_RE.exec(xml)?.[0];
  if (tag === undefined) return xml;

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

  // El rango que se emite SIEMPRE ancla en A1, así que un `ref` que arranca más
  // a la derecha (BCP declara `B1:AB42` teniendo celdas en la columna A) deja
  // celdas afuera y hay que reescribirlo aunque su esquina final alcance.
  const declaradas = esquinasDeclaradas(tag);
  const anclaEnA1 = declaradas?.inicio.columna === 1 && declaradas.inicio.fila === 1;
  if (
    declaradas !== null &&
    anclaEnA1 &&
    declaradas.fin.columna >= maxColumna &&
    declaradas.fin.fila >= maxFila
  ) {
    return xml;
  }

  const columna = Math.max(maxColumna, declaradas?.fin.columna ?? 0);
  const fila = Math.max(maxFila, declaradas?.fin.fila ?? 0);
  return xml.replace(DIMENSION_RE, `<dimension ref="A1:${letrasDeColumna(columna)}${fila}"/>`);
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
 * Conservador: solo reescribe los `xl/worksheets/sheetN.xml` que cambian.
 *
 * Cuando NINGUNA hoja cambia devuelve el buffer ORIGINAL, sin re-zipear. Corre
 * en la puerta única de `leerMatrizXlsx`, o sea para los 7 perfiles y dos veces
 * por importación (`reconoce()` + `parse()`), pero solo FIE lo necesita. El
 * early-return le ahorra a los otros seis un `zipSync` del archivo entero —
 * CPU SÍNCRONA, medida en 9-13 ms sobre los fixtures de 60-100 KB del repo — y,
 * más importante, los deja fuera del round-trip `unzipSync`/`zipSync` de fflate,
 * que descarta metadata del zip (timestamps, método de compresión por entrada,
 * extra fields). Nada de eso le importa hoy a `read-excel-file`; es superficie
 * que no hace falta tocar en un archivo que ya está sano.
 *
 * Idempotente en sentido LITERAL: sobre un archivo sano devuelve el mismo
 * buffer, byte a byte.
 */
export function sanearXlsxJasperReports(archivo: Buffer): Buffer {
  const entradas = unzipSync(new Uint8Array(archivo));

  const saneadas: Record<string, Uint8Array> = {};
  let huboCambio = false;
  for (const [nombre, contenido] of Object.entries(entradas)) {
    if (!WORKSHEET_RE.test(nombre)) {
      saneadas[nombre] = contenido;
      continue;
    }
    const xml = Buffer.from(contenido).toString('utf8');
    const saneado = sanearHojaXml(xml);
    if (saneado === xml) {
      saneadas[nombre] = contenido;
      continue;
    }
    saneadas[nombre] = strToU8(saneado);
    huboCambio = true;
  }

  if (!huboCambio) return archivo;

  return Buffer.from(zipSync(saneadas));
}
