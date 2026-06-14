import type { Prisma } from '@prisma/client';

export const SECUENCIA_DOCUMENTO_FISICO_PORT = Symbol('SECUENCIA_DOCUMENTO_FISICO_PORT');

/**
 * Puerto del contador atómico de numeración de documentos físicos.
 *
 * Contrato: al llamar `siguienteNumero` se incrementa el contador asociado a
 * `(tenantId, tipoDocumentoFisicoId)` de forma serializada incluso bajo
 * concurrencia — dos llamadas paralelas devuelven valores distintos y
 * consecutivos. La implementación esperada es un upsert atómico
 * `INSERT ... ON CONFLICT DO UPDATE RETURNING ultimoNumero`.
 *
 * Diferencia vs SecuenciaComprobantePort: la PK no incluye year/month porque
 * la secuencia de documentos físicos es CONTINUA (no reinicia por mes). El
 * valor inicial es `numeroInicial` parametrizado (configurable por
 * TipoDocumentoFisico), en lugar del 1 fijo del comprobante.
 *
 * Primer documento del tipo ⇒ devuelve `numeroInicial`; siguientes ⇒ +1.
 *
 * **Prohibido** implementar con `SELECT MAX(numero) + 1` o en dos statements
 * separados (§4.9 CLAUDE.md, Anti-24, cicatriz VOUCHER_NUMBER_CONTENTION).
 *
 * Acepta opcionalmente un `tx` para participar de la transacción del caller —
 * crítico al crear el documento, para que la numeración se asigne en la MISMA
 * transacción que el insert del documento (§4.9 atomicidad).
 */
export abstract class SecuenciaDocumentoFisicoPort {
  abstract siguienteNumero(
    tenantId: string,
    tipoDocumentoFisicoId: string,
    numeroInicial: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
