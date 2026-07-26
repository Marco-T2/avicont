/**
 * Detecta tramos de calendario NO cubiertos por ninguna importación (REQ-CB-09).
 *
 * Dos preguntas DISTINTAS, por eso dos funciones:
 *
 * - `detectarHuecos` compara los rangos ENTRE SÍ. No conoce ventana: sirve al
 *   endpoint de integridad, donde la serie de extractos se juzga sola, sin
 *   arranque ni corte. (Nació sin endpoint en v1; hoy lo tiene —
 *   `GET /api/cuentas-bancarias/:id/integridad` — además de alimentar los
 *   motivos del informe.)
 *
 * - `detectarHuecosDeBorde` compara los rangos contra una VENTANA pedida. Es
 *   la única que puede ver los extremos, porque un tramo sin cubrir antes de
 *   la primera importación —o después de la última— no tiene contra qué
 *   compararse: no hay un rango "anterior" del cual sea el hueco. Sin esto, el
 *   informe emitido sobre un período que arranca en datos que ningún extracto
 *   cubrió no dice NADA, que es exactamente la ceguera que la verificación de
 *   integridad existe para eliminar, corrida a los bordes.
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

/**
 * Los dos extremos de `ventana` que ninguna importación cubre.
 *
 * `ventana` es el rango que el informe realmente compara: `arranque.fecha + 1
 * día` … `corte`. Todo lo anterior al arranque está absorbido en los saldos
 * declarados y no se juzga acá.
 *
 * Por qué importa el borde FINAL aunque parezca trivial: el saldo contra el
 * que se concilia es el del último movimiento ≤ corte. Si la cobertura termina
 * antes del corte, ese saldo es VIEJO respecto del corte pedido — la
 * aritmética cierra igual y el número que se muestra no es el del día que el
 * usuario pidió. Se advierte siempre, sin mirar el reloj: que el tramo todavía
 * no haya ocurrido no lo vuelve conciliable.
 *
 * Cuando NINGUNA importación toca la ventana, el hueco es uno solo y se
 * devuelve como `inicial` (`final` queda en `null`): son el mismo tramo, y
 * emitirlo dos veces sería reportar dos problemas donde hay uno.
 */
export interface HuecosDeBorde {
  readonly inicial: RangoCobertura | null;
  readonly final: RangoCobertura | null;
}

export function detectarHuecosDeBorde(
  rangos: readonly RangoCobertura[],
  ventana: RangoCobertura,
): HuecosDeBorde {
  // Ventana vacía (arranque declarado el mismo día del corte): no hay nada que
  // cubrir, así que no hay nada que reprochar.
  if (ventana.desde.isAfter(ventana.hasta)) return { inicial: null, final: null };

  const tocanLaVentana = rangos.filter(
    (r) => !r.hasta.isBefore(ventana.desde) && !r.desde.isAfter(ventana.hasta),
  );

  if (tocanLaVentana.length === 0) {
    return { inicial: { desde: ventana.desde, hasta: ventana.hasta }, final: null };
  }

  const primerInicio = tocanLaVentana.reduce(
    (min, r) => (r.desde.isBefore(min) ? r.desde : min),
    tocanLaVentana[0]!.desde,
  );
  // El fin cubierto es el MÁXIMO `hasta`, no el `hasta` del rango que empieza
  // último: un extracto viejo y largo puede cubrir más lejos que uno reciente
  // y corto.
  const ultimoFin = tocanLaVentana.reduce(
    (max, r) => (r.hasta.isAfter(max) ? r.hasta : max),
    tocanLaVentana[0]!.hasta,
  );

  return {
    inicial: primerInicio.isAfter(ventana.desde)
      ? { desde: ventana.desde, hasta: primerInicio.restarDias(1) }
      : null,
    final: ultimoFin.isBefore(ventana.hasta)
      ? { desde: ultimoFin.sumarDias(1), hasta: ventana.hasta }
      : null,
  };
}
