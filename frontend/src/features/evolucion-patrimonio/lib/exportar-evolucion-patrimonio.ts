import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal } from '@/lib/export-excel';
import type { Celda } from '@/lib/export-excel';
import type { EvolucionPatrimonioResponse } from '@/types/api';

/**
 * Mapea una respuesta del EEPN a la matriz de celdas para el Excel.
 *
 * Estructura:
 * 1. Filas de cabecera fiscal.
 * 2. Fila de encabezados de columna (5 columnas).
 * 3. Una fila por componente del patrimonio.
 * 4. Fila de totales (negrita).
 * 5. Fila de cuadre con la diferencia del backend.
 *
 * §4.5: los montos (saldoInicial / resultado / otrosMovimientos / saldoFinal /
 * diferenciaBob) vienen del backend como string. NUNCA se suman ni restan en
 * cliente: cada celda numérica escribe el string tal cual.
 */
export function mapearEvolucionPatrimonioAFilas(
  response: EvolucionPatrimonioResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal
  filas.push(...armarCabeceraFiscal(perfil));

  // 2. Encabezados de columna — negrita
  filas.push([
    { type: 'texto', value: 'Componente', fontWeight: 'bold' },
    { type: 'texto', value: 'Saldo inicial (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Resultado del ejercicio (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Otros movimientos (BOB)', fontWeight: 'bold' },
    { type: 'texto', value: 'Saldo final (BOB)', fontWeight: 'bold' },
  ]);

  // 3. Una fila por componente
  for (const c of response.componentes) {
    const nombre = c.codigoInterno !== null ? `${c.codigoInterno} ${c.nombre}` : c.nombre;
    filas.push([
      { type: 'texto', value: nombre },
      { type: 'numero', value: c.saldoInicialBob },
      { type: 'numero', value: c.resultadoEjercicioBob },
      { type: 'numero', value: c.otrosMovimientosBob },
      { type: 'numero', value: c.saldoFinalBob },
    ]);
  }

  // 4. Totales — negrita
  filas.push([
    { type: 'texto', value: 'TOTAL', fontWeight: 'bold' },
    { type: 'numero', value: response.totales.saldoInicialBob, fontWeight: 'bold' },
    { type: 'numero', value: response.totales.resultadoEjercicioBob, fontWeight: 'bold' },
    { type: 'numero', value: response.totales.otrosMovimientosBob, fontWeight: 'bold' },
    { type: 'numero', value: response.totales.saldoFinalBob, fontWeight: 'bold' },
  ]);

  // 5. Cuadre — valor del backend, sin recalcular
  filas.push([
    { type: 'texto', value: response.cuadra ? '✓ Cuadra' : '✗ No cuadra', fontWeight: 'bold' },
    { type: 'texto', value: '' },
    { type: 'texto', value: '' },
    { type: 'texto', value: 'Diferencia', fontWeight: 'bold' },
    { type: 'numero', value: response.diferenciaBob, fontWeight: 'bold' },
  ]);

  return filas;
}
