/**
 * Verifica si el ancla `(comprobanteId, orden)` de un `MatchConciliacion`
 * sigue siendo válida contra el snapshot de 5 campos guardado al confirmar
 * el match (REQ-CB-10, design §2). Función PURA — no ejecuta ninguna
 * escritura, no consulta nada: recibe la línea YA resuelta por el caller
 * (el workspace ya la trajo para pintar el panel — §2.2 del design) o
 * `null` si el ancla no resolvió a ninguna línea.
 *
 * El caller (fuera de este slice) resuelve `lineaActual` buscando
 * `(comprobanteId, orden)` en el Map de líneas contables de la cuenta banco
 * en el rango consultado — o vía `listarPorAnclas` cuando quedó huérfana
 * (design §2.2). Esta función solo compara: no sabe de dónde salió la línea.
 *
 * Caso benigno (decisión 1 del design): si `orden` se corrió por una
 * edición pero la línea que terminó ocupando esa posición coincide en los
 * 5 campos del snapshot, el vínculo se considera VÁLIDO — es económicamente
 * equivalente. Esta función no necesita lógica especial para eso: compara
 * campo a campo lo que le llega, sea cual sea su origen físico.
 */
import type { LadoContable, Moneda } from '@prisma/client';

import type { FechaContable } from '@/common/domain/fecha-contable';
import type { Money } from '@/common/domain/money';

export type MotivoVinculoRoto =
  | 'LINEA_INEXISTENTE'
  | 'COMPROBANTE_ANULADO'
  | 'CUENTA_CAMBIADA'
  | 'MONTO_CAMBIADO'
  | 'LADO_CAMBIADO'
  | 'MONEDA_CAMBIADA'
  | 'FECHA_CAMBIADA';

/** Fotografía de las propiedades que hacen válido el match (design §2.1). */
export interface SnapshotAncla {
  readonly cuentaId: string;
  readonly monto: Money;
  readonly tipo: LadoContable;
  readonly moneda: Moneda;
  readonly fecha: FechaContable;
}

/** Línea contable ya resuelta por el caller en `(comprobanteId, orden)`. */
export interface LineaContableActual {
  readonly cuentaId: string;
  readonly monto: Money;
  readonly tipo: LadoContable;
  readonly moneda: Moneda;
  readonly fecha: FechaContable;
  readonly anulado: boolean;
}

export interface ResultadoVerificacionAncla {
  readonly valido: boolean;
  /** `null` cuando `valido === true`. */
  readonly motivo: MotivoVinculoRoto | null;
}

function roto(motivo: MotivoVinculoRoto): ResultadoVerificacionAncla {
  return { valido: false, motivo };
}

const VALIDO: ResultadoVerificacionAncla = { valido: true, motivo: null };

export function verificarAnclas(
  snapshot: SnapshotAncla,
  lineaActual: LineaContableActual | null,
): ResultadoVerificacionAncla {
  if (lineaActual === null) {
    return roto('LINEA_INEXISTENTE');
  }
  if (lineaActual.anulado) {
    return roto('COMPROBANTE_ANULADO');
  }
  if (lineaActual.cuentaId !== snapshot.cuentaId) {
    return roto('CUENTA_CAMBIADA');
  }
  if (!lineaActual.monto.igualaConTolerancia(snapshot.monto)) {
    return roto('MONTO_CAMBIADO');
  }
  if (lineaActual.tipo !== snapshot.tipo) {
    return roto('LADO_CAMBIADO');
  }
  if (lineaActual.moneda !== snapshot.moneda) {
    return roto('MONEDA_CAMBIADA');
  }
  if (!lineaActual.fecha.equals(snapshot.fecha)) {
    return roto('FECHA_CAMBIADA');
  }
  return VALIDO;
}
