import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal } from '@/lib/export-excel';
import type { Celda, ColumnaHoja } from '@/lib/export-excel';
import type { ColumnaPdf } from '@/lib/export-pdf';
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
 * Columnas para el PDF del Balance de Comprobación (flex = widths del Excel). Portrait.
 */
export const COLUMNAS_PDF_BALANCE_COMPROBACION: ColumnaPdf[] = [
  { flex: 14 }, // Código
  { flex: 40 }, // Cuenta
  { flex: 12 }, // Naturaleza
  { flex: 16 }, // Sumas Débito
  { flex: 16 }, // Sumas Crédito
  { flex: 16 }, // Saldo Deudor
  { flex: 16 }, // Saldo Acreedor
];

/**
 * Mapea una respuesta del Balance de Comprobación a la matriz de filas de DATOS
 * (encabezados + detalle + totales + cuadre + sección opcional naturaleza
 * opuesta), SIN la cabecera fiscal.
 *
 * Es la fuente única compartida por Excel (que le antepone armarCabeceraFiscal)
 * y PDF (que pasa el perfil al builder).
 *
 * Estructura del resultado:
 * 1. Fila de encabezados de columna (negrita).
 * 2. Una fila por cuenta de detalle con movimiento (REQ-BC-04).
 * 3. Fila de TOTALES (las 4 columnas de montos en negrita).
 * 4. Fila de cuadre con las diferencias del backend (REQ-BC-06).
 * 5. Sección opcional "naturaleza opuesta" si hay cuentas a revisar (REQ-BC-07).
 *
 * §4.5: sumasDebito / sumasCredito / saldoDeudor / saldoAcreedor / totales /
 * diferencias se pasan como CeldaNumero con el string del backend. El builder
 * hace el único boundary string→Number. NUNCA se acumula en cliente.
 */
export function mapearBalanceComprobacionAFilasDatos(
  response: BalanceComprobacionResponse,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Encabezados de columna
  filas.push([
    { type: 'texto', value: 'Código', fontWeight: 'bold' },
    { type: 'texto', value: 'Cuenta', fontWeight: 'bold' },
    { type: 'texto', value: 'Naturaleza', fontWeight: 'bold' },
    { type: 'texto', value: 'Sumas Débito', fontWeight: 'bold' },
    { type: 'texto', value: 'Sumas Crédito', fontWeight: 'bold' },
    { type: 'texto', value: 'Saldo Deudor', fontWeight: 'bold' },
    { type: 'texto', value: 'Saldo Acreedor', fontWeight: 'bold' },
  ]);

  // 2. Líneas de detalle
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

  // 3. Totales de las 4 columnas (valores del backend, sin recalcular)
  filas.push([
    { type: 'texto', value: 'TOTALES', fontWeight: 'bold' },
    { type: 'texto', value: '' },
    { type: 'texto', value: '' },
    { type: 'numero', value: response.totalSumasDebito, fontWeight: 'bold' },
    { type: 'numero', value: response.totalSumasCredito, fontWeight: 'bold' },
    { type: 'numero', value: response.totalSaldoDeudor, fontWeight: 'bold' },
    { type: 'numero', value: response.totalSaldoAcreedor, fontWeight: 'bold' },
  ]);

  // 4. Cuadre (REQ-BC-06): diferenciaSumas / diferenciaSaldos del backend
  filas.push([
    { type: 'texto', value: response.cuadra ? '✓ Cuadra' : '✗ No cuadra', fontWeight: 'bold' },
    { type: 'texto', value: 'Diferencia sumas', fontWeight: 'bold' },
    { type: 'numero', value: response.diferenciaSumas, fontWeight: 'bold' },
    { type: 'texto', value: 'Diferencia saldos', fontWeight: 'bold' },
    { type: 'numero', value: response.diferenciaSaldos, fontWeight: 'bold' },
    { type: 'texto', value: '' },
    { type: 'texto', value: '' },
  ]);

  // 5. Cuentas con saldo de naturaleza opuesta (REQ-BC-07): señal de calidad.
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

/**
 * Mapea una respuesta del Balance de Comprobación a la matriz Excel:
 * cabecera fiscal ++ filas de datos. Wrapper delgado (output byte-equivalente).
 */
export function mapearBalanceComprobacionAFilas(
  response: BalanceComprobacionResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  return [...armarCabeceraFiscal(perfil), ...mapearBalanceComprobacionAFilasDatos(response)];
}
