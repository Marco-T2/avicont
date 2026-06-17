import { formatearFechaCelda } from '@/lib/export-excel';
import type { Celda } from '@/lib/export-excel';
import type { ColumnaPdf } from '@/lib/export-pdf/types';
import type { LibroDiarioResponse } from '@/types/api';

/**
 * Columnas del Libro Diario en PDF. El `flex` reparte el ancho de la página
 * (espeja proporcionalmente los anchos del Excel: [14,12,35,40,16,16,10]).
 */
export const COLUMNAS_LIBRO_DIARIO_PDF: ColumnaPdf[] = [
  { flex: 14 }, // Fecha
  { flex: 12 }, // Código
  { flex: 35 }, // Cuenta
  { flex: 40 }, // Glosa
  { flex: 16 }, // Debe (BOB)
  { flex: 16 }, // Haber (BOB)
  { flex: 10 }, // Estado
];

/**
 * Mapea una respuesta del Libro Diario a la matriz de celdas del cuerpo del PDF.
 *
 * A diferencia del Excel (`mapearLibroDiarioAFilas`), NO incluye la cabecera
 * fiscal: en el PDF la cabecera se renderiza como bloque full-width aparte,
 * porque en una tabla de columnas fijas las líneas "Etiqueta: valor" quedarían
 * comprimidas. La matriz contiene:
 *
 * 1. Fila de encabezados de columna (negrita).
 * 2. Por cada asiento → por cada línea: fila de detalle.
 * 3. Fila de totales con totalDebeBob / totalHaberBob del backend.
 *
 * §4.5: los montos viajan como CeldaNumero con el string del backend; el formateo
 * de presentación ocurre en el render (tabla-pdf), NUNCA se suman en cliente.
 * §4.6: fechaContable se convierte vía formatearFechaCelda (sin Date/UTC).
 */
export function mapearLibroDiarioACeldasPdf(response: LibroDiarioResponse): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Encabezados de columna — negrita para resaltar la estructura del informe
  filas.push([
    { type: 'texto', value: 'Fecha', fontWeight: 'bold' },
    { type: 'texto', value: 'Código', fontWeight: 'bold' },
    { type: 'texto', value: 'Cuenta', fontWeight: 'bold' },
    { type: 'texto', value: 'Glosa', fontWeight: 'bold' },
    { type: 'texto', value: 'Debe (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Haber (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Estado', fontWeight: 'bold' },
  ]);

  // 2. Filas de detalle: aplanar asientos → líneas
  for (const asiento of response.asientos) {
    const fechaCelda = formatearFechaCelda(asiento.fechaContable);
    const estadoCelda: Celda = {
      type: 'texto',
      // §4.7: asientos anulados se marcan visualmente en el informe
      value: asiento.anulado ? 'Anulado' : '',
    };

    for (const linea of asiento.lineas) {
      filas.push([
        { type: 'texto', value: fechaCelda },
        { type: 'texto', value: linea.codigoCuenta },
        { type: 'texto', value: linea.nombreCuenta },
        // §null-safety: glosa puede ser null — nunca imprimir "null"
        { type: 'texto', value: linea.glosa ?? '' },
        // §4.5: monto como string crudo; el render lo formatea para presentación
        { type: 'numero', value: linea.debeBob },
        { type: 'numero', value: linea.haberBob },
        estadoCelda,
      ]);
    }
  }

  // 3. Fila de totales — valores del backend, SIN recalcular en cliente; negrita
  filas.push([
    { type: 'texto', value: 'TOTAL', fontWeight: 'bold' },
    { type: 'texto', value: '', fontWeight: 'bold' },
    { type: 'texto', value: '', fontWeight: 'bold' },
    { type: 'texto', value: '', fontWeight: 'bold' },
    { type: 'numero', value: response.totalDebeBob, fontWeight: 'bold' },
    { type: 'numero', value: response.totalHaberBob, fontWeight: 'bold' },
    { type: 'texto', value: '', fontWeight: 'bold' },
  ]);

  return filas;
}
