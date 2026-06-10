import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal, formatearFechaCelda } from '@/lib/export-excel';
import type { Celda } from '@/lib/export-excel';
import type { LibroMayorResponse } from '@/types/api';

/**
 * Mapea una respuesta del Libro Mayor a la matriz de celdas para el Excel.
 *
 * Estructura del resultado:
 * 1. Filas de cabecera fiscal (armarCabeceraFiscal — tolera null por campo).
 * 2. Fila de encabezados de columna.
 * 3. Por cada cuenta → fila de cabecera de cuenta (saldos del backend) +
 *    por cada movimiento: fila de detalle con saldoCorrienteBob del backend.
 * 4. Fila de total general con totalDebeBob / totalHaberBob del backend.
 *
 * §4.5: saldoCorrienteBob, totalDebeBob, totalHaberBob se pasan como CeldaNumero
 * con el string del backend. El builder (construir-hoja) hace el único boundary
 * string→Number. NUNCA se acumulan valores en cliente.
 *
 * §4.6: fechaContable se convierte vía formatearFechaCelda (sin Date/UTC).
 */
export function mapearLibroMayorAFilas(
  response: LibroMayorResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal (campos no-null del perfil)
  filas.push(...armarCabeceraFiscal(perfil));

  // 2. Fila de encabezados de columna — negrita para resaltar la estructura del informe
  filas.push([
    { type: 'texto', value: 'Fecha', fontWeight: 'bold' },
    { type: 'texto', value: 'Comprobante', fontWeight: 'bold' },
    { type: 'texto', value: 'Glosa', fontWeight: 'bold' },
    { type: 'texto', value: 'Debe (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Haber (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Saldo (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Estado', fontWeight: 'bold' },
  ]);

  // 3. Por cada cuenta: fila de cabecera + filas de movimientos
  for (const cuenta of response.cuentas) {
    // Fila de cabecera de cuenta con saldos del backend
    filas.push([
      { type: 'texto', value: `${cuenta.codigoInterno} - ${cuenta.nombreCuenta}` },
      { type: 'texto', value: '' },
      { type: 'texto', value: `Saldo inicial: ${cuenta.saldoInicialBob}` },
      { type: 'numero', value: cuenta.totalDebeBob },
      { type: 'numero', value: cuenta.totalHaberBob },
      { type: 'numero', value: cuenta.saldoFinalBob },
      { type: 'texto', value: '' },
    ]);

    for (const mov of cuenta.movimientos) {
      const fechaCelda = formatearFechaCelda(mov.fechaContable);
      // §null-safety: glosaLinea puede ser null → caer a glosa del comprobante
      const glosaCelda = mov.glosaLinea ?? mov.glosa;

      filas.push([
        { type: 'texto', value: fechaCelda },
        { type: 'texto', value: mov.numeroComprobante ?? '' },
        { type: 'texto', value: glosaCelda },
        // §4.5: montos se pasan como string; el builder los convierte a Number
        { type: 'numero', value: mov.debeBob },
        { type: 'numero', value: mov.haberBob },
        // §4.5: saldoCorrienteBob viene del backend; NO se acumula en cliente
        { type: 'numero', value: mov.saldoCorrienteBob },
        // §4.7: movimientos de comprobantes anulados se marcan visualmente
        { type: 'texto', value: mov.anulado ? 'Anulado' : '' },
      ]);
    }
  }

  // 4. Fila de totales — valores del backend, SIN recalcular en cliente; negrita para totales
  filas.push([
    { type: 'texto', value: 'TOTAL', fontWeight: 'bold' },
    { type: 'texto', value: '', fontWeight: 'bold' },
    { type: 'texto', value: '', fontWeight: 'bold' },
    { type: 'numero', value: response.totalDebeBob, fontWeight: 'bold' },
    { type: 'numero', value: response.totalHaberBob, fontWeight: 'bold' },
    { type: 'texto', value: '', fontWeight: 'bold' },
    { type: 'texto', value: '', fontWeight: 'bold' },
  ]);

  return filas;
}
