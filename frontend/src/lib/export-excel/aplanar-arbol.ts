import type { Celda } from './construir-hoja';

// ============================================================
// Tipos estructurales propios del helper (dependencia invertida).
// Las features adaptan sus DTOs a estos tipos; la lib NO importa
// de ninguna feature.
// ============================================================

export interface CuentaArbol {
  nombre: string;
  /** null para cuentas sintéticas que no tienen código asignado. */
  codigoInterno: string | null;
  saldoBob: string;
  esContraria: boolean;
  nivel: number;
}

export interface SubseccionArbol {
  titulo: string;
  /** §4.5: totalBob viene del backend; el helper NO lo recalcula. */
  totalBob: string;
  cuentas: CuentaArbol[];
}

export interface SeccionArbol {
  titulo: string;
  /** §4.5: totalBob viene del backend; el helper NO lo recalcula. */
  totalBob: string;
  subsecciones: SubseccionArbol[];
}

// Sangría textual para representar la jerarquía 3-niveles en la columna Concepto:
// Nivel 0 (sección): sin sangría
// Nivel 1 (subsección): '  ' (2 espacios)
// Nivel 2 (cuenta): '    ' (4 espacios)
const SANGRIA_SUBSECCION = '  ';
const SANGRIA_CUENTA = '    ';

/**
 * Aplana un árbol jerárquico (Sección → Subsección → Cuenta) a una matriz
 * de celdas para el Excel.
 *
 * Estructura de salida por sección:
 *   1. Fila de título de sección (sin sangría)
 *   2. Por cada subsección:
 *      a. Fila de título de subsección (1 nivel de sangría)
 *      b. Por cada cuenta: fila de detalle (2 niveles de sangría)
 *      c. Fila de subtotal de subsección
 *   3. Fila de subtotal de sección
 *
 * §4.5 Anti-recálculo: los `totalBob` de sección y subsección provienen
 * del backend. Este helper NO los suma ni los deriva de las cuentas.
 *
 * §4.6: las fechas no aplican en el árbol de cuentas (no hay fechas aquí).
 */
export function aplanarArbol(secciones: SeccionArbol[]): Celda[][] {
  const filas: Celda[][] = [];

  for (const seccion of secciones) {
    // Fila de título de sección
    filas.push([
      { type: 'texto', value: seccion.titulo },
      { type: 'texto', value: '' },
    ]);

    for (const sub of seccion.subsecciones) {
      // Fila de título de subsección
      filas.push([
        { type: 'texto', value: `${SANGRIA_SUBSECCION}${sub.titulo}` },
        { type: 'texto', value: '' },
      ]);

      for (const cuenta of sub.cuentas) {
        // Concepto: código (si existe) + nombre + sufijo contraria
        const codigoParte = cuenta.codigoInterno !== null ? `${cuenta.codigoInterno} - ` : '';
        const contrariaLabel = cuenta.esContraria ? ' (contraria)' : '';
        const concepto = `${SANGRIA_CUENTA}${codigoParte}${cuenta.nombre}${contrariaLabel}`;

        filas.push([
          { type: 'texto', value: concepto },
          // §4.5: saldoBob es el string decimal del backend; lo pasamos como CeldaNumero
          { type: 'numero', value: cuenta.saldoBob },
        ]);
      }

      // Fila de subtotal de subsección — valor del backend, sin recalcular
      filas.push([
        { type: 'texto', value: `${SANGRIA_SUBSECCION}Total ${sub.titulo}` },
        { type: 'numero', value: sub.totalBob },
      ]);
    }

    // Fila de subtotal de sección — valor del backend, sin recalcular
    filas.push([
      { type: 'texto', value: `Total ${seccion.titulo}` },
      { type: 'numero', value: seccion.totalBob },
    ]);
  }

  return filas;
}
