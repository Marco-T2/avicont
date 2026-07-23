/**
 * Hash de deduplicación de un `MovimientoBancario` (design §6.1, REQ-CB-07).
 *
 *   hashDedup = sha256( 'v1' ⧉ cuentaBancariaId ⧉ fechaIso ⧉ montoCentavos
 *                            ⧉ tipo ⧉ descripcionNormalizada ⧉ ordinalDia )
 *
 * `⧉` = U+001F (INFORMATION SEPARATOR ONE / Unit Separator) — imposible en
 * una celda de banco. Sin él, `('AB','C')` y `('A','BC')` colisionarían.
 *
 * `montoCentavos` sale de `Money.toBob()` (string `"12600.00"`), NUNCA de un
 * `number` (CLAUDE.md §4.5). Prefijo de versión `'v1'`: si algún día cambia
 * la normalización, es un cambio explícito y greppable con plan de re-hash,
 * no una tormenta silenciosa de duplicados.
 *
 * Persistido como `MovimientoBancario.hashDedup` + `@@unique([cuentaBancariaId,
 * hashDedup])` — la idempotencia de la importación es ESTRUCTURAL, enforzada
 * en DB vía `createMany({ skipDuplicates: true })`, no una comparación en el
 * service.
 */
import { createHash } from 'node:crypto';

import type { MovimientoConOrdinalDia } from './ordinal-dia';
import { normalizarDescripcion } from './normalizar-descripcion';

const SEPARADOR = '';
const VERSION = 'v1';

export function calcularHashDedup(cuentaBancariaId: string, item: MovimientoConOrdinalDia): string {
  const { movimiento, ordinalDia } = item;
  const campos = [
    VERSION,
    cuentaBancariaId,
    movimiento.fecha.toIso(),
    movimiento.monto.toBob(),
    movimiento.tipo,
    normalizarDescripcion(movimiento.descripcion),
    String(ordinalDia),
  ];
  return createHash('sha256').update(campos.join(SEPARADOR), 'utf8').digest('hex');
}
