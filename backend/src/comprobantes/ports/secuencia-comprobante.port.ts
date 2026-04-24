import type { Prisma, TipoComprobante } from '@prisma/client';

export const SECUENCIA_COMPROBANTE_PORT = Symbol('SECUENCIA_COMPROBANTE_PORT');

/**
 * Puerto del contador atómico de numeración de comprobantes.
 *
 * Contrato: al llamar `siguienteCorrelativo` se incrementa el contador
 * asociado a `(tenantId, tipo, year, month)` de forma serializada incluso bajo
 * concurrencia — dos llamadas paralelas devuelven valores distintos y
 * consecutivos. La implementación esperada es un upsert atómico
 * `INSERT ... ON CONFLICT DO UPDATE RETURNING ultimo_numero`.
 *
 * **Prohibido** implementar esto con `SELECT MAX(numero) + 1` o leyendo +
 * escribiendo en dos statements separados (Anti-24 CLAUDE.md §8.1,
 * cicatriz VOUCHER_NUMBER_CONTENTION del sistema anterior).
 *
 * Acepta opcionalmente un `tx` para participar de la transacción del caller —
 * crítico al contabilizar un comprobante, para que la numeración se asigne
 * en la MISMA transacción que el update de estado.
 */
export abstract class SecuenciaComprobantePort {
  abstract siguienteCorrelativo(
    tenantId: string,
    tipo: TipoComprobante,
    year: number,
    month: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
