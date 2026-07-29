import { esEfectivoPorCodigo } from '@/common/domain/efectivo';
import { ActividadFlujo } from '@/common/domain/enums';

/**
 * ¿Puede esta cuenta recibir plata? (REQ-CXC-02)
 *
 * Criterio ÚNICO del flujo comercial — lo comparten el `Cobro` y la venta
 * CONTADO (REQ-VTA-04); Anti-01: no se define dos veces.
 *
 *     activa ∧ esDetalle ∧ ( actividadFlujo = 'EFECTIVO'  ∨  código bajo 1.1.1 )
 *
 * ## Tres precisiones que NO son adorno
 *
 * **Unión, no fallback.** La marca explícita **agrega**; nunca quita. Una
 * cuenta bajo `1.1.1` marcada `OPERACION` **sigue siendo elegible**. La lectura
 * "explícito, y en su defecto el prefijo" la excluiría, y es la que traía la
 * spec antes de corregirse.
 *
 * **Por cuenta, no por organización.** El Estado de Flujo de Efectivo usa un
 * interruptor org-wide (si ALGUNA cuenta está marcada `EFECTIVO`, la heurística
 * del prefijo se apaga para TODAS). Acá eso sería un desastre operativo:
 * marcar `1.1.1.002 BANCOS` para mejorar un reporte sacaría `1.1.1.001 CAJA`
 * —el default del cobro, D-05— del selector.
 *
 * **La divergencia con el EFE es deliberada** (decisión de Marco, 2026-07-28).
 * Son dos preguntas distintas: *"¿es efectivo y equivalente para el flujo de
 * caja?"* (presentación) vs. *"¿puede entrar plata acá?"* (operación). Lo
 * compartido con el EFE es el hecho —el prefijo y cómo se compara, en
 * `common/domain/efectivo.ts`—, no la regla construida encima.
 */
export interface CuentaParaElegibilidad {
  codigoInterno: string;
  esDetalle: boolean;
  activa: boolean;
  actividadFlujo: ActividadFlujo | null;
}

export function esElegibleComoDestinoDeEfectivo(cuenta: CuentaParaElegibilidad): boolean {
  // §4.1: toda línea contable referencia una cuenta activa y de detalle.
  if (!cuenta.activa || !cuenta.esDetalle) return false;

  return cuenta.actividadFlujo === ActividadFlujo.EFECTIVO || esEfectivoPorCodigo(cuenta);
}
