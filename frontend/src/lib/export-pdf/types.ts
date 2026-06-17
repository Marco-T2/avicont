/**
 * Tipos puros de la infraestructura de export a PDF.
 *
 * Vive separado de los componentes react-pdf para que los mapeadores de cada
 * feature (puros, testeables) importen estos tipos SIN arrastrar `@react-pdf/renderer`
 * a su grafo de módulos ni al chunk de la ruta.
 */

/** Orientación de la página del informe. */
export type OrientacionPdf = 'portrait' | 'landscape';

/**
 * Configuración de una columna de la tabla PDF.
 * `flex` reparte proporcionalmente el ancho disponible de la página
 * (análogo a `ColumnaHoja.width` del Excel).
 */
export interface ColumnaPdf {
  flex: number;
}
