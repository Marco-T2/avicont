/**
 * Motor de sugerencias — dominio puro, ≥95% cobertura (REQ-CB-12, design §5).
 * Compara movimientos bancarios `PENDIENTE` (incluye los de vínculo roto)
 * contra líneas contables `EN_TRANSITO`, y ranquea por confianza. NUNCA
 * auto-confirma: devuelve una lista ranqueada, el usuario confirma siempre
 * (decisión 2). v1 = estrictamente 1↔1 (design §5.3) — la unicidad real la
 * enforza la escritura (`@@unique`); acá solo influye el ranking.
 */
import type { FechaContable } from '@/common/domain/fecha-contable';
import type { Money } from '@/common/domain/money';
import type { LadoBancario, LadoContable, Moneda } from '@prisma/client';

import { ladoContableEsperado } from './lado-contable';

const VENTANA_DIAS = 3;

export type Confianza = 'ALTA' | 'MEDIA' | 'BAJA';

export interface MovimientoPendiente {
  readonly id: string;
  readonly fecha: FechaContable;
  readonly monto: Money;
  /** Perspectiva del BANCO (extracto). */
  readonly tipo: LadoBancario;
  readonly moneda: Moneda;
}

export interface LineaCandidata {
  readonly comprobanteId: string;
  readonly orden: number;
  readonly fecha: FechaContable;
  readonly monto: Money;
  /** Perspectiva de la EMPRESA (línea de comprobante). */
  readonly tipo: LadoContable;
  readonly moneda: Moneda;
}

export interface Sugerencia {
  readonly movimientoId: string;
  readonly comprobanteId: string;
  readonly orden: number;
  readonly confianza: Confianza;
  readonly diferenciaDias: number;
}

interface ParElegible {
  readonly movimiento: MovimientoPendiente;
  readonly linea: LineaCandidata;
  readonly diferenciaDias: number;
}

const RANGO_CONFIANZA: Record<Confianza, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

function claveLinea(l: Pick<LineaCandidata, 'comprobanteId' | 'orden'>): string {
  return `${l.comprobanteId}:${l.orden}`;
}

function esElegible(p: MovimientoPendiente, l: LineaCandidata): { diferenciaDias: number } | null {
  if (l.moneda !== p.moneda) return null;
  if (l.tipo !== ladoContableEsperado(p.tipo)) return null;
  if (!l.monto.igualaConTolerancia(p.monto)) return null;
  const diferenciaDias = Math.abs(p.fecha.diferenciaEnDias(l.fecha));
  if (diferenciaDias > VENTANA_DIAS) return null;
  return { diferenciaDias };
}

export function sugerir(
  movimientosPendientes: readonly MovimientoPendiente[],
  lineasCandidatas: readonly LineaCandidata[],
): Sugerencia[] {
  const pares: ParElegible[] = [];
  for (const movimiento of movimientosPendientes) {
    for (const linea of lineasCandidatas) {
      const elegible = esElegible(movimiento, linea);
      if (elegible !== null) {
        pares.push({ movimiento, linea, diferenciaDias: elegible.diferenciaDias });
      }
    }
  }

  const candidatosDeMovimiento = new Map<string, number>();
  const reclamantesDeLinea = new Map<string, number>();
  for (const par of pares) {
    candidatosDeMovimiento.set(
      par.movimiento.id,
      (candidatosDeMovimiento.get(par.movimiento.id) ?? 0) + 1,
    );
    const clave = claveLinea(par.linea);
    reclamantesDeLinea.set(clave, (reclamantesDeLinea.get(clave) ?? 0) + 1);
  }

  const sugerencias: Sugerencia[] = pares.map((par) => {
    const unicoEnAmbasDirecciones =
      candidatosDeMovimiento.get(par.movimiento.id) === 1 &&
      reclamantesDeLinea.get(claveLinea(par.linea)) === 1;
    const confianza: Confianza =
      par.diferenciaDias === 0 && unicoEnAmbasDirecciones
        ? 'ALTA'
        : unicoEnAmbasDirecciones
          ? 'MEDIA'
          : 'BAJA';
    return {
      movimientoId: par.movimiento.id,
      comprobanteId: par.linea.comprobanteId,
      orden: par.linea.orden,
      confianza,
      diferenciaDias: par.diferenciaDias,
    };
  });

  return sugerencias.sort((a, b) => {
    if (RANGO_CONFIANZA[a.confianza] !== RANGO_CONFIANZA[b.confianza]) {
      return RANGO_CONFIANZA[a.confianza] - RANGO_CONFIANZA[b.confianza];
    }
    if (a.diferenciaDias !== b.diferenciaDias) {
      return a.diferenciaDias - b.diferenciaDias;
    }
    if (a.comprobanteId !== b.comprobanteId) {
      return a.comprobanteId < b.comprobanteId ? -1 : 1;
    }
    return a.orden - b.orden;
  });
}
