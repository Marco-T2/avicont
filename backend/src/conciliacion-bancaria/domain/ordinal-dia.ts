/**
 * Asigna `ordinalDia` a cada movimiento: el índice de ocurrencia (0-based)
 * dentro de su grupo de tupla idéntica `(fecha, monto, tipo,
 * descripcionNormalizada)` (design §6.3, REQ-CB-07).
 *
 * PRECONDICIÓN: `movimientosOrdenados` ya pasó por `ordenarCanonico` — esta
 * función NO reordena. Cuenta por GRUPO DE TUPLA, no por posición ni por
 * "el día completo": un import parcial que trajera un movimiento menos de
 * OTRO grupo no corre los ordinales de este. De esta única regla salen las
 * dos propiedades exigidas: dos movimientos idénticos el mismo día
 * sobreviven ambos (ordinales distintos ⇒ hashes distintos), y reimportar
 * el mismo conjunto en el mismo orden canónico regenera los mismos
 * ordinales (⇒ dedup).
 */
import type { MovimientoParseado } from '../ports/extracto-parser.port';
import { normalizarDescripcion } from './normalizar-descripcion';

export interface MovimientoConOrdinalDia {
  readonly movimiento: MovimientoParseado;
  readonly ordinalDia: number;
}

function claveGrupoTupla(mov: MovimientoParseado): string {
  return `${mov.fecha.toIso()}␟${mov.monto.toBob()}␟${mov.tipo}␟${normalizarDescripcion(mov.descripcion)}`;
}

export function asignarOrdinalDia(
  movimientosOrdenados: readonly MovimientoParseado[],
): MovimientoConOrdinalDia[] {
  const contadorPorGrupo = new Map<string, number>();
  return movimientosOrdenados.map((movimiento) => {
    const clave = claveGrupoTupla(movimiento);
    const ordinalDia = contadorPorGrupo.get(clave) ?? 0;
    contadorPorGrupo.set(clave, ordinalDia + 1);
    return { movimiento, ordinalDia };
  });
}
