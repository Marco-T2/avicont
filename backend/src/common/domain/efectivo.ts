/**
 * Identificación de cuentas de EFECTIVO Y EQUIVALENTES por código de plan.
 *
 * ## Qué se comparte acá — y qué NO
 *
 * Esto es la **base** que comparten el Estado de Flujo de Efectivo y el flujo
 * comercial (Ventas/Cobros): el prefijo del plan de cuentas y el predicado por
 * cuenta. Vive en `common/` porque `reportes` y `cuentas` lo necesitan y ningún
 * módulo puede importar del otro (§3.3).
 *
 * **Las dos reglas construidas encima NO son la misma, y la divergencia es
 * deliberada** (decisión de Marco, 2026-07-28):
 *
 * | Consumidor | Regla |
 * |---|---|
 * | EFE (`reportes/domain/estado-flujo-efectivo.ts`) | **interruptor de organización**: si ALGUNA cuenta está marcada `actividadFlujo = 'EFECTIVO'`, la heurística del prefijo se apaga para TODAS |
 * | Ventas/Cobros (`cuentas`, `esElegibleComoDestino`) | **unión POR CUENTA**: `activa ∧ esDetalle ∧ (marca EFECTIVO ∨ prefijo)` — la marca AGREGA, nunca quita |
 *
 * Son dos preguntas distintas: *"¿es efectivo y equivalente para el flujo de
 * caja?"* (presentación) vs. *"¿puede entrar plata acá?"* (operación). Con el
 * interruptor org-wide, marcar `1.1.1.002 BANCOS` para mejorar un reporte
 * **sacaría `1.1.1.001 CAJA` del selector de cobros**.
 *
 * Anti-01 se respeta donde corresponde: el hecho compartido —cuál es el prefijo
 * y cómo se compara— vive en un solo lugar. Las reglas de negocio de cada
 * consumidor viven con su dueño.
 */

/**
 * Prefijo de efectivo y equivalentes del plan de cuentas — convención del seed
 * comercial (`1.1.1` = "EFECTIVO Y EQUIVALENTES DE EFECTIVO", hojas CAJA/BANCOS).
 * Heurística confiable como fallback, no garantía: el admin puede recodificar.
 */
export const CODIGO_EFECTIVO_PREFIJO = '1.1.1';

/** Superficie mínima que necesita el predicado. Tipado estructural a propósito:
 *  lo satisfacen tanto `CuentaEstructuraRow` (reportes) como `Cuenta` (cuentas),
 *  sin que `common/` tenga que conocer a ninguno de los dos. */
export interface CuentaParaEfectivo {
  codigoInterno: string;
  esDetalle: boolean;
}

/**
 * ¿La cuenta cae bajo el prefijo de efectivo del plan?
 *
 * La comparación es **por segmento**, no `startsWith` a secas: el plan de
 * cuentas es editable y `'1.1.10.001'.startsWith('1.1.1')` es `true`, así que
 * un hermano recién creado quedaría clasificado como efectivo. En el EFE eso
 * es una línea mal ubicada; en Ventas, una cuenta equivocada habilitada para
 * recibir plata.
 */
export function esEfectivoPorCodigo(cuenta: CuentaParaEfectivo): boolean {
  if (!cuenta.esDetalle) return false;
  const codigo = cuenta.codigoInterno;
  return codigo === CODIGO_EFECTIVO_PREFIJO || codigo.startsWith(`${CODIGO_EFECTIVO_PREFIJO}.`);
}
