import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { aplanarArbol, armarCabeceraFiscal } from '@/lib/export-excel';
import type { Celda, SeccionArbol } from '@/lib/export-excel';
import type { EstadoResultadosResponse, SeccionResultados } from '@/types/api';

/**
 * Adapta una sección del Estado de Resultados al formato de árbol del helper.
 *
 * CuentaResultados NO tiene `esSintetica` y `cuentaId` es non-null. El helper
 * aplanarArbol opera sobre los campos comunes; este adaptador hace el mapeo.
 */
function adaptarSeccionResultados(seccion: SeccionResultados): SeccionArbol {
  return {
    titulo: seccion.titulo,
    totalBob: seccion.totalBob,
    subsecciones: seccion.subsecciones.map((sub) => ({
      titulo: sub.titulo,
      totalBob: sub.totalBob,
      cuentas: sub.cuentas.map((c) => ({
        nombre: c.nombre,
        codigoInterno: c.codigoInterno,
        saldoBob: c.saldoBob,
        esContraria: c.esContraria,
        nivel: c.nivel,
      })),
    })),
  };
}

/**
 * Adapta las 2 secciones del Estado de Resultados al array de SeccionArbol.
 */
export function adaptarSeccionesResultados(response: EstadoResultadosResponse): SeccionArbol[] {
  return [
    adaptarSeccionResultados(response.ingreso),
    adaptarSeccionResultados(response.egreso),
  ];
}

/**
 * Mapea una respuesta del Estado de Resultados a la matriz de celdas para el Excel.
 *
 * Estructura del resultado:
 * 1. Filas de cabecera fiscal.
 * 2. Fila de encabezados de columna (Concepto | Saldo BOB).
 * 3. Filas del árbol aplanado (ingreso + egreso) vía `aplanarArbol`.
 * 4. Filas de resultado del ejercicio con los totales del backend.
 *
 * §4.5: totalIngresoBob / totalEgresoBob / resultadoEjercicioBob vienen del
 * backend. NUNCA se restan ni calculan en cliente.
 */
export function mapearEstadoResultadosAFilas(
  response: EstadoResultadosResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal
  filas.push(...armarCabeceraFiscal(perfil));

  // 2. Encabezados de columna — negrita para resaltar la estructura del informe
  filas.push([
    { type: 'texto', value: 'Concepto', fontWeight: 'bold' },
    { type: 'texto', value: 'Saldo (BOB)', fontWeight: 'bold' },
  ]);

  // 3. Árbol aplanado de las 2 secciones (reusa el mismo helper que el Balance)
  filas.push(...aplanarArbol(adaptarSeccionesResultados(response)));

  // 4. Filas de resultado del ejercicio — valores del backend, sin calcular en cliente; negrita para totales
  filas.push([
    { type: 'texto', value: 'TOTAL INGRESOS', fontWeight: 'bold' },
    { type: 'numero', value: response.totalIngresoBob, fontWeight: 'bold' },
  ]);
  filas.push([
    { type: 'texto', value: 'TOTAL EGRESOS', fontWeight: 'bold' },
    { type: 'numero', value: response.totalEgresoBob, fontWeight: 'bold' },
  ]);
  filas.push([
    // §4.5: resultadoEjercicioBob del backend; la etiqueta refleja esGanancia del backend
    { type: 'texto', value: response.esGanancia ? 'Resultado del Ejercicio: Ganancia' : 'Resultado del Ejercicio: Pérdida', fontWeight: 'bold' },
    { type: 'numero', value: response.resultadoEjercicioBob, fontWeight: 'bold' },
  ]);

  return filas;
}
