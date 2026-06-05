import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { aplanarArbol, armarCabeceraFiscal } from '@/lib/export-excel';
import type { Celda, SeccionArbol } from '@/lib/export-excel';
import type { BalanceGeneralResponse, SeccionBalance } from '@/types/api';

/**
 * Adapta las secciones del Balance General al formato de árbol del helper.
 *
 * CuentaBalance tiene `cuentaId` nullable y `esSintetica`. El helper
 * aplanarArbol opera sobre los campos comunes (nombre/codigoInterno/saldoBob/
 * esContraria/nivel); ignora `cuentaId` y `esSintetica`.
 */
function adaptarSeccion(seccion: SeccionBalance): SeccionArbol {
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
 * Adapta las 3 secciones del Balance General al array de SeccionArbol.
 */
export function adaptarSeccionesBalance(response: BalanceGeneralResponse): SeccionArbol[] {
  return [
    adaptarSeccion(response.activo),
    adaptarSeccion(response.pasivo),
    adaptarSeccion(response.patrimonio),
  ];
}

/**
 * Mapea una respuesta del Balance General a la matriz de celdas para el Excel.
 *
 * Estructura del resultado:
 * 1. Filas de cabecera fiscal.
 * 2. Fila de encabezados de columna (Concepto | Saldo BOB).
 * 3. Filas del árbol aplanado (activo + pasivo + patrimonio) vía `aplanarArbol`.
 * 4. Filas de cuadre con los totales del backend.
 *
 * §4.5: totalActivoBob / totalPasivoBob / totalPatrimonioBob / diferenciaBob
 * vienen del backend. NUNCA se suman o restan en cliente.
 */
export function mapearBalanceGeneralAFilas(
  response: BalanceGeneralResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal
  filas.push(...armarCabeceraFiscal(perfil));

  // 2. Encabezados de columna
  filas.push([
    { type: 'texto', value: 'Concepto' },
    { type: 'texto', value: 'Saldo (BOB)' },
  ]);

  // 3. Árbol aplanado de las 3 secciones
  filas.push(...aplanarArbol(adaptarSeccionesBalance(response)));

  // 4. Filas de cuadre — valores del backend, sin recalcular
  filas.push([
    { type: 'texto', value: 'TOTAL ACTIVO' },
    { type: 'numero', value: response.totalActivoBob },
  ]);
  filas.push([
    { type: 'texto', value: 'TOTAL PASIVO' },
    { type: 'numero', value: response.totalPasivoBob },
  ]);
  filas.push([
    { type: 'texto', value: 'TOTAL PATRIMONIO' },
    { type: 'numero', value: response.totalPatrimonioBob },
  ]);
  filas.push([
    { type: 'texto', value: response.cuadra ? '✓ Cuadra' : '✗ No cuadra' },
    // §4.5: diferenciaBob del backend (0.00 si cuadra, otro valor si hay diferencia)
    { type: 'numero', value: response.diferenciaBob },
  ]);

  return filas;
}
