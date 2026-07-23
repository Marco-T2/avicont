/**
 * Detecta tramos de calendario NO cubiertos por ninguna importación
 * (REQ-CB-09). Capacidad de DOMINIO, no una feature expuesta: v1 no tiene
 * endpoint ni pantalla que la sirva (proposal.md la deja fuera de alcance).
 * Queda lista para un slice posterior (drawer de historial, alertas de
 * importación incompleta). NO cablear a ningún controller en v1.
 */
import { FechaContable } from '@/common/domain/fecha-contable';

export interface RangoCobertura {
  readonly desde: FechaContable;
  readonly hasta: FechaContable;
}

interface Acumulador {
  readonly huecos: readonly RangoCobertura[];
  /** `null` = todavía no se procesó ningún rango. */
  readonly finCubiertoHasta: FechaContable | null;
}

export function detectarHuecos(rangos: readonly RangoCobertura[]): RangoCobertura[] {
  const ordenados = [...rangos].sort((a, b) => a.desde.compare(b.desde));

  const resultado = ordenados.reduce<Acumulador>(
    (acumulado, actual) => {
      if (acumulado.finCubiertoHasta === null) {
        return { huecos: acumulado.huecos, finCubiertoHasta: actual.hasta };
      }

      // Contiguo o solapado si empieza a lo sumo un día después del fin cubierto.
      const esContiguoOSolapado = actual.desde.diferenciaEnDias(acumulado.finCubiertoHasta) <= 1;
      const huecos = esContiguoOSolapado
        ? acumulado.huecos
        : [
            ...acumulado.huecos,
            { desde: acumulado.finCubiertoHasta.sumarDias(1), hasta: actual.desde.restarDias(1) },
          ];
      const finCubiertoHasta = actual.hasta.isAfter(acumulado.finCubiertoHasta)
        ? actual.hasta
        : acumulado.finCubiertoHasta;
      return { huecos, finCubiertoHasta };
    },
    { huecos: [], finCubiertoHasta: null },
  );

  return [...resultado.huecos];
}
