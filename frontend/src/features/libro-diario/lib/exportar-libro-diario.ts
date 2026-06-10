import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal, formatearFechaCelda } from '@/lib/export-excel';
import type { Celda } from '@/lib/export-excel';
import type { LibroDiarioResponse } from '@/types/api';

/**
 * Mapea una respuesta del Libro Diario a la matriz de celdas para el Excel.
 *
 * Estructura del resultado:
 * 1. Filas de cabecera fiscal (armarCabeceraFiscal — tolera null por campo).
 * 2. Fila de encabezados de columna.
 * 3. Por cada asiento → por cada línea: fila de detalle.
 * 4. Fila de totales con totalDebeBob / totalHaberBob del backend.
 *
 * §4.5: debeBob/haberBob/totalDebeBob/totalHaberBob se pasan como CeldaNumero
 * con el string del backend. El builder (construir-hoja) hace el único boundary
 * string→Number. NUNCA se suman columnas en cliente.
 *
 * §4.6: fechaContable se convierte vía formatearFechaCelda (sin Date/UTC).
 */
export function mapearLibroDiarioAFilas(
  response: LibroDiarioResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal (campos no-null del perfil)
  const cabeceraFiscal = armarCabeceraFiscal(perfil);
  filas.push(...cabeceraFiscal);

  // 2. Fila de encabezados de columna — negrita para resaltar la estructura del informe
  filas.push([
    { type: 'texto', value: 'Fecha', fontWeight: 'bold' },
    { type: 'texto', value: 'Código', fontWeight: 'bold' },
    { type: 'texto', value: 'Cuenta', fontWeight: 'bold' },
    { type: 'texto', value: 'Glosa', fontWeight: 'bold' },
    { type: 'texto', value: 'Debe (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Haber (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Estado', fontWeight: 'bold' },
  ]);

  // 3. Filas de detalle: aplanar asientos → líneas
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
        // §4.5: los montos se pasan como string; el builder los convierte a Number
        { type: 'numero', value: linea.debeBob },
        { type: 'numero', value: linea.haberBob },
        estadoCelda,
      ]);
    }
  }

  // 4. Fila de totales — valores del backend, SIN recalcular en cliente; negrita para totales
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
