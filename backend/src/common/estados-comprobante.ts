import { EstadoComprobante } from '@prisma/client';

/**
 * Estados en los que un comprobante **cuenta**: plata efectivamente movida.
 *
 * `CLAUDE.md` §4.4 lo enuncia como regla del core:
 *
 * > Corolario para cualquier lectura que pregunte "¿este comprobante cuenta?":
 * > el predicado es `estado IN (CONTABILIZADO, BLOQUEADO) AND anulado = false`,
 * > **nunca `CONTABILIZADO` a secas** — el cierre mensual haría desaparecer
 * > todo lo del período cerrado.
 *
 * El motivo es una operación de rutina, no un borde: cerrar un período ejecuta
 * `bloquearPorPeriodo` y pasa **todos** sus comprobantes de `CONTABILIZADO` a
 * `BLOQUEADO` en masa; reabrirlo lo revierte. Filtrar por `CONTABILIZADO` solo
 * vacía la lectura el día del cierre, con los datos intactos.
 *
 * ⚠️ **El nombre es histórico y más angosto que el concepto.** Nació en la
 * conciliación bancaria ("¿esta línea es conciliable?"), pero el predicado es
 * general: Ventas y Cuentas por Cobrar lo usan para decidir qué integra la
 * **cartera** de un cliente (REQ-VTA-01, REQ-CXC-01). Se conserva el nombre
 * porque es el identificador con el que §4.4 del core lo referencia; renombrarlo
 * es un cambio propio, con su actualización del doc.
 *
 * ⚠️ **Esto es la MITAD del predicado.** El `anulado = false` va aparte, en cada
 * query — un comprobante anulado sigue estando `CONTABILIZADO`.
 *
 * Vive en `common/` y no en `common/domain/` porque habla vocabulario Prisma:
 * sus dos consumidores son un adapter (`comprobantes`) y un service que
 * consulta Prisma (`conciliacion-bancaria`), y §3.3 impide que uno importe del
 * otro.
 */
export const ESTADOS_CONCILIABLES: readonly EstadoComprobante[] = [
  EstadoComprobante.CONTABILIZADO,
  EstadoComprobante.BLOQUEADO,
];
