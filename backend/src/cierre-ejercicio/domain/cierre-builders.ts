import { ClaseCuenta, NaturalezaCuenta } from '@/common/domain/enums';
import { Money } from '@/common/domain/money';

import { CierrePartidaDobleError } from './cierre-errors';
import { type AporteCierre, netDe } from './signed-net';

/** Saldo de una cuenta hoja de resultado (INGRESO/EGRESO) leído con `excluirCierre=true`. */
export interface SaldoCuentaCierre {
  cuentaId: string;
  clase: ClaseCuenta;
  naturaleza: NaturalezaCuenta;
  debitoBob: Money;
  creditoBob: Money;
}

/** Una línea del asiento de cierre: débito O crédito (XOR), el otro es ZERO. */
export interface LineaCierre {
  cuentaId: string;
  debito: Money;
  credito: Money;
}

/** Un asiento de cierre. `lineas: []` ⇒ SKIP (no se genera el comprobante). */
export interface AsientoCierre {
  glosa: string;
  lineas: LineaCierre[];
}

function lineaDebe(cuentaId: string, monto: Money): LineaCierre {
  return { cuentaId, debito: monto, credito: Money.ZERO };
}

function lineaHaber(cuentaId: string, monto: Money): LineaCierre {
  return { cuentaId, debito: Money.ZERO, credito: monto };
}

function lineaDeAporte(cuentaId: string, aporte: AporteCierre): LineaCierre {
  return aporte.lado === 'DEBE'
    ? lineaDebe(cuentaId, aporte.monto)
    : lineaHaber(cuentaId, aporte.monto);
}

/**
 * Verifica partida doble del asiento y lanza si no cuadra (defensa de dominio).
 * Código Tributario art. 47: Σdebe === Σhaber en BOB (±Bs 0.01).
 *
 * Exportada para poder ejercitar la rama de descuadre en tests: los builders
 * están construidos para SIEMPRE cuadrar, así que el único modo honesto de
 * probar el throw es invocar esta guarda con líneas desbalanceadas a propósito.
 */
export function verificarPartidaDoble(lineas: LineaCierre[]): void {
  const totalDebe = lineas.reduce((acc, l) => acc.plus(l.debito), Money.ZERO);
  const totalHaber = lineas.reduce((acc, l) => acc.plus(l.credito), Money.ZERO);
  if (!totalDebe.balanceadoEnBobCon(totalHaber)) {
    throw new CierrePartidaDobleError(
      totalDebe.toBob(),
      totalHaber.toBob(),
      totalDebe.minus(totalHaber).abs().toBob(),
    );
  }
}

/**
 * Cierra un conjunto de cuentas de resultado contra la transitoria.
 *
 * Por cada cuenta con saldo neto (signed-net) arma su línea de cierre; la
 * contrapartida agregada a la transitoria es la diferencia que balancea el
 * asiento. Si ninguna cuenta aporta línea → `lineas: []` (SKIP-on-zero).
 *
 * Ley 843 art. 46 + Código Tributario art. 47: cierre de cuentas de resultado.
 */
function cerrarCuentas(
  saldos: SaldoCuentaCierre[],
  transitoriaId: string,
  glosa: string,
): AsientoCierre {
  const lineasCuentas = saldos
    .map((s): LineaCierre | null => {
      const aporte = netDe(s.debitoBob, s.creditoBob, s.naturaleza);
      return aporte === null ? null : lineaDeAporte(s.cuentaId, aporte);
    })
    .filter((l): l is LineaCierre => l !== null);

  if (lineasCuentas.length === 0) {
    return { glosa, lineas: [] };
  }

  const totalDebe = lineasCuentas.reduce((acc, l) => acc.plus(l.debito), Money.ZERO);
  const totalHaber = lineasCuentas.reduce((acc, l) => acc.plus(l.credito), Money.ZERO);

  // La transitoria toma la diferencia en el lado opuesto para balancear el asiento.
  const transitoria: LineaCierre = totalDebe.greaterThanOrEqualTo(totalHaber)
    ? lineaHaber(transitoriaId, totalDebe.minus(totalHaber))
    : lineaDebe(transitoriaId, totalHaber.minus(totalDebe));

  const lineas = [...lineasCuentas, transitoria];
  verificarPartidaDoble(lineas);
  return { glosa, lineas };
}

/**
 * #1 — Cierra cuentas de gastos y costos (clase EGRESO, naturaleza DEUDORA).
 * Las acredita para llevarlas a cero; debita la transitoria por Σ.
 */
export function buildCerrarGastos(
  saldos: SaldoCuentaCierre[],
  transitoriaId: string,
  year: number,
): AsientoCierre {
  const gastos = saldos.filter((s) => s.clase === ClaseCuenta.EGRESO);
  return cerrarCuentas(
    gastos,
    transitoriaId,
    `Cierre de cuentas de gastos y costos — gestión ${year}`,
  );
}

/**
 * #2 — Cierra cuentas de ingresos (clase INGRESO, naturaleza ACREEDORA).
 * Las debita para llevarlas a cero; acredita la transitoria por Σ.
 */
export function buildCerrarIngresos(
  saldos: SaldoCuentaCierre[],
  transitoriaId: string,
  year: number,
): AsientoCierre {
  const ingresos = saldos.filter((s) => s.clase === ClaseCuenta.INGRESO);
  return cerrarCuentas(ingresos, transitoriaId, `Cierre de cuentas de ingresos — gestión ${year}`);
}

/**
 * #3 — Vacía la transitoria contra RESULTADOS ACUMULADOS.
 *
 * `resultado = Σingresos − Σgastos` (tras #1+#2 la transitoria tiene ese saldo):
 *   - utilidad (`resultado > 0`, transitoria ACREEDORA): DEBE transitoria / HABER RA.
 *   - pérdida (`resultado < 0`, transitoria DEUDORA): HABER transitoria / DEBE RA.
 *   - `resultado === 0` → `lineas: []` (SKIP-on-zero, nada que trasladar).
 *
 * Ley 843 art. 46: traslado del resultado de la gestión a patrimonio.
 */
export function buildTrasladarResultado(
  resultado: Money,
  transitoriaId: string,
  resultadosAcumuladosId: string,
  year: number,
): AsientoCierre {
  const glosa = `Traslado del resultado de la gestión a Resultados Acumulados — gestión ${year}`;

  if (resultado.isZero()) {
    return { glosa, lineas: [] };
  }

  const monto = resultado.abs();
  const lineas: LineaCierre[] = resultado.isPositive()
    ? [lineaDebe(transitoriaId, monto), lineaHaber(resultadosAcumuladosId, monto)]
    : [lineaHaber(transitoriaId, monto), lineaDebe(resultadosAcumuladosId, monto)];

  verificarPartidaDoble(lineas);
  return { glosa, lineas };
}
