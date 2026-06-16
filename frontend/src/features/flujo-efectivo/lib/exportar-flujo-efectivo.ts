import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal } from '@/lib/export-excel';
import type { Celda } from '@/lib/export-excel';
import type { EstadoFlujoEfectivoResponse } from '@/types/api';

import { etiquetaTipoFlujo } from './etiquetas-tipo-flujo';

/**
 * Mapea una respuesta del EFE a la matriz de celdas para el Excel.
 *
 * Estructura:
 * 1. Filas de cabecera fiscal.
 * 2. Fila de encabezados de columna (4 columnas, negrita).
 * 3. Fila del resultado del ejercicio (punto de partida del método indirecto).
 * 4. Por cada sección (operación, inversión, financiación):
 *    a. Filas de líneas.
 *    b. Fila de subtotal en negrita.
 * 5. Bloque de conciliación (efectivoInicial, variacionNeta, efectivoFinal).
 *
 * §4.5: los montos vienen del backend como string; NUNCA se suman ni restan en
 * cliente — cada celda numérica escribe el string tal cual.
 * §4.6: las fechas se usan tal cual del response, sin conversión UTC.
 */
export function mapearFlujoEfectivoAFilas(
  response: EstadoFlujoEfectivoResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal
  filas.push(...armarCabeceraFiscal(perfil));

  // 2. Encabezados de columna — 4 columnas: Actividad | Línea | Tipo | Monto (BOB)
  filas.push([
    { type: 'texto', value: 'Actividad', fontWeight: 'bold' },
    { type: 'texto', value: 'Línea', fontWeight: 'bold' },
    { type: 'texto', value: 'Tipo', fontWeight: 'bold' },
    { type: 'texto', value: 'Monto (BOB)', fontWeight: 'bold' },
  ]);

  // 3. Resultado del ejercicio — punto de partida del método indirecto
  filas.push([
    { type: 'texto', value: '—' },
    { type: 'texto', value: 'Resultado del ejercicio' },
    { type: 'texto', value: 'Resultado del ejercicio' },
    { type: 'numero', value: response.resultadoEjercicio },
  ]);

  // 4. Secciones de actividad
  const secciones: Array<{
    actividad: string;
    seccion: EstadoFlujoEfectivoResponse['operacion'];
    labelSubtotal: string;
  }> = [
    { actividad: 'Operación', seccion: response.operacion, labelSubtotal: 'Subtotal Operación' },
    { actividad: 'Inversión', seccion: response.inversion, labelSubtotal: 'Subtotal Inversión' },
    {
      actividad: 'Financiación',
      seccion: response.financiacion,
      labelSubtotal: 'Subtotal Financiación',
    },
  ];

  for (const { actividad, seccion, labelSubtotal } of secciones) {
    // Líneas de la sección
    for (const linea of seccion.lineas) {
      filas.push([
        { type: 'texto', value: actividad },
        { type: 'texto', value: linea.nombre },
        { type: 'texto', value: etiquetaTipoFlujo(linea.tipo) },
        { type: 'numero', value: linea.monto },
      ]);
    }

    // Subtotal de la sección — negrita
    filas.push([
      { type: 'texto', value: actividad },
      { type: 'texto', value: labelSubtotal, fontWeight: 'bold' },
      { type: 'texto', value: '' },
      { type: 'numero', value: seccion.subtotal, fontWeight: 'bold' },
    ]);
  }

  // 5. Bloque de conciliación
  filas.push([
    { type: 'texto', value: '—' },
    { type: 'texto', value: 'Efectivo inicial' },
    { type: 'texto', value: '' },
    { type: 'numero', value: response.efectivoInicial },
  ]);
  filas.push([
    { type: 'texto', value: '—' },
    { type: 'texto', value: 'Variación neta' },
    { type: 'texto', value: '' },
    { type: 'numero', value: response.variacionNeta },
  ]);
  filas.push([
    { type: 'texto', value: '—' },
    { type: 'texto', value: 'Efectivo final' },
    { type: 'texto', value: '' },
    { type: 'numero', value: response.efectivoFinal, fontWeight: 'bold' },
  ]);

  // Cuadre — valor del backend, sin recalcular
  filas.push([
    { type: 'texto', value: response.cuadra ? '✓ Cuadra' : '✗ No cuadra', fontWeight: 'bold' },
    { type: 'texto', value: '' },
    { type: 'texto', value: 'Diferencia', fontWeight: 'bold' },
    { type: 'numero', value: response.diferencia, fontWeight: 'bold' },
  ]);

  return filas;
}
