import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal } from '@/lib/export-excel';
import type { Celda, ColumnaHoja } from '@/lib/export-excel';
import type { BalanceComprobacionResponse } from '@/types/api';

/**
 * Columnas del Balance de Comprobación (7 columnas tabulares planas).
 */
export const COLUMNS_BALANCE_COMPROBACION: ColumnaHoja[] = [
  { width: 14 }, // Código
  { width: 40 }, // Cuenta
  { width: 12 }, // Naturaleza
  { width: 16 }, // Sumas Débito
  { width: 16 }, // Sumas Crédito
  { width: 16 }, // Saldo Deudor
  { width: 16 }, // Saldo Acreedor
];

/**
 * Mapea una respuesta del Balance de Comprobación a la matriz de celdas Excel.
 *
 * Estructura del resultado:
 * 1. Filas de cabecera fiscal (armarCabeceraFiscal — tolera null por campo).
 * 2. Fila de encabezados de columna (negrita).
 * 3. Una fila por cuenta de detalle con movimiento (REQ-BC-04).
 * 4. Fila de TOTALES (las 4 columnas de montos en negrita).
 * 5. Fila de cuadre con las diferencias del backend (REQ-BC-06).
 * 6. Sección opcional "naturaleza opuesta" si hay cuentas a revisar (REQ-BC-07).
 *
 * §4.5: sumasDebito / sumasCredito / saldoDeudor / saldoAcreedor / totales /
 * diferencias se pasan como CeldaNumero con el string del backend. El builder
 * (construir-hoja) hace el único boundary string→Number. NUNCA se acumula en
 * cliente.
 */
export function mapearBalanceComprobacionAFilas(
  response: BalanceComprobacionResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal (campos no-null del perfil)
  filas.push(...armarCabeceraFiscal(perfil));

  // 2. Encabezados de columna
  filas.push([
    { type: 'texto', value: 'Código', fontWeight: 'bold' },
    { type: 'texto', value: 'Cuenta', fontWeight: 'bold' },
    { type: 'texto', value: 'Naturaleza', fontWeight: 'bold' },
    { type: 'texto', value: 'Sumas Débito', fontWeight: 'bold' },
    { type: 'texto', value: 'Sumas Crédito', fontWeight: 'bold' },
    { type: 'texto', value: 'Saldo Deudor', fontWeight: 'bold' },
    { type: 'texto', value: 'Saldo Acreedor', fontWeight: 'bold' },
  ]);

  // 3. Líneas de detalle
  for (const linea of response.lineas) {
    filas.push([
      { type: 'texto', value: linea.codigoInterno },
      { type: 'texto', value: linea.nombre },
      { type: 'texto', value: linea.naturaleza },
      { type: 'numero', value: linea.sumasDebito },
      { type: 'numero', value: linea.sumasCredito },
      { type: 'numero', value: linea.saldoDeudor },
      { type: 'numero', value: linea.saldoAcreedor },
    ]);
  }

  // 4. Totales de las 4 columnas (valores del backend, sin recalcular)
  filas.push([
    { type: 'texto', value: 'TOTALES', fontWeight: 'bold' },
    { type: 'texto', value: '' },
    { type: 'texto', value: '' },
    { type: 'numero', value: response.totalSumasDebito, fontWeight: 'bold' },
    { type: 'numero', value: response.totalSumasCredito, fontWeight: 'bold' },
    { type: 'numero', value: response.totalSaldoDeudor, fontWeight: 'bold' },
    { type: 'numero', value: response.totalSaldoAcreedor, fontWeight: 'bold' },
  ]);

  // 5. Cuadre (REQ-BC-06): diferenciaSumas / diferenciaSaldos del backend
  filas.push([
    { type: 'texto', value: response.cuadra ? '✓ Cuadra' : '✗ No cuadra', fontWeight: 'bold' },
    { type: 'texto', value: 'Diferencia sumas', fontWeight: 'bold' },
    { type: 'numero', value: response.diferenciaSumas, fontWeight: 'bold' },
    { type: 'texto', value: 'Diferencia saldos', fontWeight: 'bold' },
    { type: 'numero', value: response.diferenciaSaldos, fontWeight: 'bold' },
    { type: 'texto', value: '' },
    { type: 'texto', value: '' },
  ]);

  // 6. Cuentas con saldo de naturaleza opuesta (REQ-BC-07): señal de calidad.
  if (response.cuentasNaturalezaOpuesta.length > 0) {
    filas.push([{ type: 'texto', value: '' }]); // espaciador
    filas.push([
      {
        type: 'texto',
        value: 'CUENTAS CON SALDO DE NATURALEZA OPUESTA (revisar)',
        fontWeight: 'bold',
      },
    ]);
    filas.push([
      { type: 'texto', value: 'Código', fontWeight: 'bold' },
      { type: 'texto', value: 'Cuenta', fontWeight: 'bold' },
      { type: 'texto', value: 'Naturaleza', fontWeight: 'bold' },
      { type: 'texto', value: 'Saldo opuesto', fontWeight: 'bold' },
    ]);
    for (const cuenta of response.cuentasNaturalezaOpuesta) {
      filas.push([
        { type: 'texto', value: cuenta.codigoInterno },
        { type: 'texto', value: cuenta.nombre },
        { type: 'texto', value: cuenta.naturaleza },
        { type: 'numero', value: cuenta.saldoOpuesto },
      ]);
    }
  }

  return filas;
}
