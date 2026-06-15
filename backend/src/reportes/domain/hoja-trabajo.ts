/**
 * Construcción de la Hoja de Trabajo de 12 Columnas.
 *
 * Función pura exportada — cero @Injectable(), cero imports de NestJS/Prisma.
 * Testeable en aislamiento total. Cobertura objetivo ≥ 95% (§7.5 CLAUDE.md).
 *
 * La Hoja de Trabajo amplía el Balance de Comprobación añadiendo:
 *   - Separación de movimientos ORDINARIOS vs AJUSTE (cols 1-4 vs cols 5-6)
 *   - Columnas de Saldos Ajustados (cols 7-8)
 *   - Routing al Estado de Resultados ER (cols 9-10: Pérdidas / Ganancias)
 *   - Routing al Balance General BG (cols 11-12: Activo / PasivoPatrimonio)
 *   - Fila de carry-over automático (Utilidad/Pérdida del Ejercicio)
 *   - 6 cuadres independientes verificados con tolerancia ±Bs 0.01 (§4.1)
 *
 * // Código Tributario art. 47 / §4.1: los cuadres de sumas, saldos, ajustes,
 * // saldos ajustados, Estado de Resultados y Balance General deben cuadrar
 * // con tolerancia ±Bs 0.01.
 */

import { Money } from '@/common/domain/money';

import { ClaseCuenta, NaturalezaCuenta } from '@/common/domain/enums';

import type { CuentaNaturalezaOpuestaCalculada } from '../dto/balance-comprobacion-response.dto';
import type { CuentaEstructuraRow, SaldoCuentaSeparadoRow } from '../ports/eeff-saldos-reader.port';

// ============================================================
// Tipos internos del builder (antes de serializar)
// ============================================================

/** Una fila calculada de la Hoja de Trabajo (cuenta de detalle o fila sintética de carry-over). */
export interface LineaHojaTrabajoCalculada {
  /** null para la fila sintética de carry-over. */
  cuentaId: string | null;
  /** null para la fila sintética de carry-over. */
  codigoInterno: string | null;
  nombre: string;
  naturaleza: NaturalezaCuenta | null;
  claseCuenta: ClaseCuenta | null;
  esContraria: boolean;
  /** true solo para la fila sintética de Utilidad/Pérdida. */
  esSintetica: boolean;
  /** Columna 1: Σ débitos de comprobantes NO-AJUSTE del rango. */
  sumasDebe: Money;
  /** Columna 2: Σ créditos de comprobantes NO-AJUSTE del rango. */
  sumasHaber: Money;
  /** Columna 3: MAX(sumasDebe − sumasHaber, 0). */
  saldoDeudor: Money;
  /** Columna 4: MAX(sumasHaber − sumasDebe, 0). */
  saldoAcreedor: Money;
  /** Columna 5: Σ débitos de comprobantes AJUSTE del rango. */
  ajustesDebe: Money;
  /** Columna 6: Σ créditos de comprobantes AJUSTE del rango. */
  ajustesHaber: Money;
  /** Columna 7: MAX((sumasDebe+ajustesDebe) − (sumasHaber+ajustesHaber), 0). */
  saldoAjustadoDeudor: Money;
  /** Columna 8: MAX((sumasHaber+ajustesHaber) − (sumasDebe+ajustesDebe), 0). */
  saldoAjustadoAcreedor: Money;
  /** Columna 9: Pérdidas del Estado de Resultados. */
  perdidas: Money;
  /** Columna 10: Ganancias del Estado de Resultados. */
  ganancias: Money;
  /** Columna 11: Activo del Balance General. */
  activo: Money;
  /** Columna 12: Pasivo + Patrimonio del Balance General. */
  pasivoPatrimonio: Money;
}

/** Totales de las 12 columnas (incluye la fila sintética de carry-over). */
export interface TotalesHojaTrabajoCalculada {
  sumasDebe: Money;
  sumasHaber: Money;
  saldoDeudor: Money;
  saldoAcreedor: Money;
  ajustesDebe: Money;
  ajustesHaber: Money;
  saldoAjustadoDeudor: Money;
  saldoAjustadoAcreedor: Money;
  perdidas: Money;
  ganancias: Money;
  activo: Money;
  pasivoPatrimonio: Money;
}

/**
 * Los 6 cuadres de la Hoja de Trabajo más el cuadre global.
 * // Código Tributario art. 47 / §4.1: tolerancia ±Bs 0.01 por redondeos.
 */
export interface CuadresHojaTrabajo {
  /** true si los 6 cuadres parciales son todos true. */
  cuadra: boolean;
  /** ΣsumasDebe ≈ ΣsumasHaber (±0.01). */
  cuadraSumas: boolean;
  /** ΣsaldoDeudor ≈ ΣsaldoAcreedor (±0.01). */
  cuadraSaldos: boolean;
  /** ΣajustesDebe ≈ ΣajustesHaber (±0.01). */
  cuadraAjustes: boolean;
  /** ΣsaldoAjustadoDeudor ≈ ΣsaldoAjustadoAcreedor (±0.01). */
  cuadraSaldosAjustados: boolean;
  /** Σperdidas ≈ Σganancias (±0.01, post carry-over). */
  cuadraEstadoResultados: boolean;
  /** Σactivo ≈ ΣpasivoPatrimonio (±0.01, post carry-over). */
  cuadraBalanceGeneral: boolean;
  diferenciaSumas: Money;
  diferenciaSaldos: Money;
  diferenciaAjustes: Money;
  diferenciaSaldosAjustados: Money;
  diferenciaEstadoResultados: Money;
  diferenciaBalanceGeneral: Money;
}

/** Resultado completo del builder. */
export interface HojaTrabajoResult {
  /** Lineas de detalle ordenadas por codigoInterno ASC + fila sintética al final (si aplica). */
  lineas: LineaHojaTrabajoCalculada[];
  totales: TotalesHojaTrabajoCalculada;
  cuadres: CuadresHojaTrabajo;
  /** Cuentas cuyo saldo ajustado cae del lado opuesto a su naturaleza. Señal de calidad. */
  cuentasNaturalezaOpuesta: CuentaNaturalezaOpuestaCalculada[];
}

/** Parámetros de entrada del builder. */
export interface ConstruirHojaTrabajoParams {
  estructura: CuentaEstructuraRow[];
  saldosSeparados: SaldoCuentaSeparadoRow[];
}

// ============================================================
// Función principal
// ============================================================

/**
 * Construye la Hoja de Trabajo de 12 columnas a partir de la estructura de
 * cuentas y los saldos separados (ordinarios vs ajuste) del rango [desde, hasta].
 *
 * // Código Tributario art. 47 / §4.1: cuadre de las 6 pares de columnas.
 */
export function construirHojaTrabajo(params: ConstruirHojaTrabajoParams): HojaTrabajoResult {
  const { estructura, saldosSeparados } = params;

  // Índice de cuentas de DETALLE por id. Las agrupadoras nunca aparecen como fila.
  const detallePorId = new Map<string, CuentaEstructuraRow>();
  for (const cta of estructura) {
    if (cta.esDetalle) {
      detallePorId.set(cta.id, cta);
    }
  }

  const lineas: LineaHojaTrabajoCalculada[] = [];

  for (const fila of saldosSeparados) {
    // REQ-HT-20: fila sin cuenta de detalle en estructura (desactivada u otro) → ignorar.
    const cuenta = detallePorId.get(fila.cuentaId);
    if (!cuenta) continue;

    const sumasDebe = Money.of(fila.debitoOrdinarioBob);
    const sumasHaber = Money.of(fila.creditoOrdinarioBob);
    const ajustesDebe = Money.of(fila.debitoAjusteBob);
    const ajustesHaber = Money.of(fila.creditoAjusteBob);

    // REQ-HT-12: omitir cuentas sin ningún movimiento (ordinario ni ajuste).
    if (
      sumasDebe.isZero() &&
      sumasHaber.isZero() &&
      ajustesDebe.isZero() &&
      ajustesHaber.isZero()
    ) {
      continue;
    }

    // Columnas 3–4: saldo de sumas (mecánica universal).
    const diffDeudor = sumasDebe.minus(sumasHaber);
    const saldoDeudor = diffDeudor.isPositive() ? diffDeudor : Money.ZERO;
    const diffAcreedor = sumasHaber.minus(sumasDebe);
    const saldoAcreedor = diffAcreedor.isPositive() ? diffAcreedor : Money.ZERO;

    // Columnas 7–8: saldo ajustado = sumas + ajustes.
    const totDebe = sumasDebe.plus(ajustesDebe);
    const totHaber = sumasHaber.plus(ajustesHaber);
    const diffAjDeudor = totDebe.minus(totHaber);
    const saldoAjustadoDeudor = diffAjDeudor.isPositive() ? diffAjDeudor : Money.ZERO;
    const diffAjAcreedor = totHaber.minus(totDebe);
    const saldoAjustadoAcreedor = diffAjAcreedor.isPositive() ? diffAjAcreedor : Money.ZERO;

    // Columnas 9–12: routing ER / BG con soporte para esContraria (D-05).
    const { perdidas, ganancias, activo, pasivoPatrimonio } = clasificarParaSecciones(
      cuenta,
      saldoAjustadoDeudor,
      saldoAjustadoAcreedor,
    );

    lineas.push({
      cuentaId: cuenta.id,
      codigoInterno: cuenta.codigoInterno,
      nombre: cuenta.nombre,
      naturaleza: cuenta.naturaleza,
      claseCuenta: cuenta.claseCuenta,
      esContraria: cuenta.esContraria,
      esSintetica: false,
      sumasDebe,
      sumasHaber,
      saldoDeudor,
      saldoAcreedor,
      ajustesDebe,
      ajustesHaber,
      saldoAjustadoDeudor,
      saldoAjustadoAcreedor,
      perdidas,
      ganancias,
      activo,
      pasivoPatrimonio,
    });
  }

  // REQ-HT-13: orden por codigoInterno ASC (solo las filas de detalle).
  lineas.sort((a, b) => {
    if (a.codigoInterno === null) return 1;
    if (b.codigoInterno === null) return -1;
    return a.codigoInterno.localeCompare(b.codigoInterno);
  });

  // ── Acumular totales PRE-carry-over (columnas 1–8) ────────────────────
  let totalSumasDebe = Money.ZERO;
  let totalSumasHaber = Money.ZERO;
  let totalSaldoDeudor = Money.ZERO;
  let totalSaldoAcreedor = Money.ZERO;
  let totalAjustesDebe = Money.ZERO;
  let totalAjustesHaber = Money.ZERO;
  let totalSaldoAjustadoDeudor = Money.ZERO;
  let totalSaldoAjustadoAcreedor = Money.ZERO;
  let totalPerdidas = Money.ZERO;
  let totalGanancias = Money.ZERO;
  let totalActivo = Money.ZERO;
  let totalPasivoPatrimonio = Money.ZERO;

  for (const linea of lineas) {
    totalSumasDebe = totalSumasDebe.plus(linea.sumasDebe);
    totalSumasHaber = totalSumasHaber.plus(linea.sumasHaber);
    totalSaldoDeudor = totalSaldoDeudor.plus(linea.saldoDeudor);
    totalSaldoAcreedor = totalSaldoAcreedor.plus(linea.saldoAcreedor);
    totalAjustesDebe = totalAjustesDebe.plus(linea.ajustesDebe);
    totalAjustesHaber = totalAjustesHaber.plus(linea.ajustesHaber);
    totalSaldoAjustadoDeudor = totalSaldoAjustadoDeudor.plus(linea.saldoAjustadoDeudor);
    totalSaldoAjustadoAcreedor = totalSaldoAjustadoAcreedor.plus(linea.saldoAjustadoAcreedor);
    totalPerdidas = totalPerdidas.plus(linea.perdidas);
    totalGanancias = totalGanancias.plus(linea.ganancias);
    totalActivo = totalActivo.plus(linea.activo);
    totalPasivoPatrimonio = totalPasivoPatrimonio.plus(linea.pasivoPatrimonio);
  }

  // ── REQ-HT-09: carry-over Utilidad / Pérdida ─────────────────────────
  // utilidad = Σganancias - Σperdidas (puede ser negativo → pérdida)
  const utilidad = totalGanancias.minus(totalPerdidas);

  if (!utilidad.isZero()) {
    let perdidasSint = Money.ZERO;
    let gananciasSint = Money.ZERO;
    let activoSint = Money.ZERO;
    let pasivoPatSint = Money.ZERO;
    let nombre: string;

    if (utilidad.isPositive()) {
      // Ganancia → va en Pérdidas (ER) y PasivoPatrimonio (BG)
      nombre = 'Utilidad del Ejercicio';
      perdidasSint = utilidad;
      pasivoPatSint = utilidad;
    } else {
      // Pérdida → va en Ganancias (ER) y Activo (BG)
      nombre = 'Pérdida del Ejercicio';
      gananciasSint = utilidad.abs();
      activoSint = utilidad.abs();
    }

    const filaSintetica: LineaHojaTrabajoCalculada = {
      cuentaId: null,
      codigoInterno: null,
      nombre,
      naturaleza: null,
      claseCuenta: null,
      esContraria: false,
      esSintetica: true,
      sumasDebe: Money.ZERO,
      sumasHaber: Money.ZERO,
      saldoDeudor: Money.ZERO,
      saldoAcreedor: Money.ZERO,
      ajustesDebe: Money.ZERO,
      ajustesHaber: Money.ZERO,
      saldoAjustadoDeudor: Money.ZERO,
      saldoAjustadoAcreedor: Money.ZERO,
      perdidas: perdidasSint,
      ganancias: gananciasSint,
      activo: activoSint,
      pasivoPatrimonio: pasivoPatSint,
    };

    lineas.push(filaSintetica);

    // Actualizar totales post-carry-over (solo ER y BG)
    totalPerdidas = totalPerdidas.plus(perdidasSint);
    totalGanancias = totalGanancias.plus(gananciasSint);
    totalActivo = totalActivo.plus(activoSint);
    totalPasivoPatrimonio = totalPasivoPatrimonio.plus(pasivoPatSint);
  }

  // ── Cuadres (6 pares + cuadra global) ────────────────────────────────
  // §4.1: tolerancia ±Bs 0.01 en todas las comparaciones.
  const cuadraSumas = totalSumasDebe.balanceadoEnBobCon(totalSumasHaber);
  const cuadraSaldos = totalSaldoDeudor.balanceadoEnBobCon(totalSaldoAcreedor);
  const cuadraAjustes = totalAjustesDebe.balanceadoEnBobCon(totalAjustesHaber);
  const cuadraSaldosAjustados = totalSaldoAjustadoDeudor.balanceadoEnBobCon(
    totalSaldoAjustadoAcreedor,
  );
  const cuadraEstadoResultados = totalPerdidas.balanceadoEnBobCon(totalGanancias);
  const cuadraBalanceGeneral = totalActivo.balanceadoEnBobCon(totalPasivoPatrimonio);

  const cuadra =
    cuadraSumas &&
    cuadraSaldos &&
    cuadraAjustes &&
    cuadraSaldosAjustados &&
    cuadraEstadoResultados &&
    cuadraBalanceGeneral;

  const cuadres: CuadresHojaTrabajo = {
    cuadra,
    cuadraSumas,
    cuadraSaldos,
    cuadraAjustes,
    cuadraSaldosAjustados,
    cuadraEstadoResultados,
    cuadraBalanceGeneral,
    diferenciaSumas: totalSumasDebe.minus(totalSumasHaber),
    diferenciaSaldos: totalSaldoDeudor.minus(totalSaldoAcreedor),
    diferenciaAjustes: totalAjustesDebe.minus(totalAjustesHaber),
    diferenciaSaldosAjustados: totalSaldoAjustadoDeudor.minus(totalSaldoAjustadoAcreedor),
    diferenciaEstadoResultados: totalPerdidas.minus(totalGanancias),
    diferenciaBalanceGeneral: totalActivo.minus(totalPasivoPatrimonio),
  };

  // ── REQ-HT-18: cuentas de naturaleza opuesta (sobre saldo ajustado) ──
  // Usa el saldo ajustado (cols 7–8), no el saldo de sumas (cols 3–4).
  const cuentasNaturalezaOpuesta: CuentaNaturalezaOpuestaCalculada[] = [];
  for (const linea of lineas) {
    if (linea.esSintetica) continue;
    if (linea.naturaleza === NaturalezaCuenta.DEUDORA && linea.saldoAjustadoAcreedor.isPositive()) {
      cuentasNaturalezaOpuesta.push({
        cuentaId: linea.cuentaId!,
        codigoInterno: linea.codigoInterno!,
        nombre: linea.nombre,
        naturaleza: linea.naturaleza,
        saldoOpuesto: linea.saldoAjustadoAcreedor,
      });
    } else if (
      linea.naturaleza === NaturalezaCuenta.ACREEDORA &&
      linea.saldoAjustadoDeudor.isPositive()
    ) {
      cuentasNaturalezaOpuesta.push({
        cuentaId: linea.cuentaId!,
        codigoInterno: linea.codigoInterno!,
        nombre: linea.nombre,
        naturaleza: linea.naturaleza,
        saldoOpuesto: linea.saldoAjustadoDeudor,
      });
    }
  }

  return {
    lineas,
    totales: {
      sumasDebe: totalSumasDebe,
      sumasHaber: totalSumasHaber,
      saldoDeudor: totalSaldoDeudor,
      saldoAcreedor: totalSaldoAcreedor,
      ajustesDebe: totalAjustesDebe,
      ajustesHaber: totalAjustesHaber,
      saldoAjustadoDeudor: totalSaldoAjustadoDeudor,
      saldoAjustadoAcreedor: totalSaldoAjustadoAcreedor,
      perdidas: totalPerdidas,
      ganancias: totalGanancias,
      activo: totalActivo,
      pasivoPatrimonio: totalPasivoPatrimonio,
    },
    cuadres,
    cuentasNaturalezaOpuesta,
  };
}

// ============================================================
// Helper: routing por clase de cuenta
// ============================================================

interface SeccionesCalculadas {
  perdidas: Money;
  ganancias: Money;
  activo: Money;
  pasivoPatrimonio: Money;
}

/**
 * Asigna el saldo ajustado a la sección correcta de ER (cols 9–10) y BG (cols 11–12).
 *
 * Para cuentas `esContraria=true`, el monto va en la sección de su clase pero
 * NEGADO, porque la cuenta resta del grupo al que pertenece (D-05 del design).
 *
 * Ejemplo: Depreciación Acumulada (ACTIVO, ACREEDORA, esContraria=true) va en
 * bgActivo con valor negativo, reduciendo el activo total.
 */
function clasificarParaSecciones(
  cuenta: CuentaEstructuraRow,
  saldoAjDeudor: Money,
  saldoAjAcreedor: Money,
): SeccionesCalculadas {
  if (!cuenta.esContraria) {
    switch (cuenta.claseCuenta) {
      case ClaseCuenta.ACTIVO:
        return {
          perdidas: Money.ZERO,
          ganancias: Money.ZERO,
          activo: saldoAjDeudor,
          pasivoPatrimonio: Money.ZERO,
        };
      case ClaseCuenta.PASIVO:
      case ClaseCuenta.PATRIMONIO:
        return {
          perdidas: Money.ZERO,
          ganancias: Money.ZERO,
          activo: Money.ZERO,
          pasivoPatrimonio: saldoAjAcreedor,
        };
      case ClaseCuenta.EGRESO:
        return {
          perdidas: saldoAjDeudor,
          ganancias: Money.ZERO,
          activo: Money.ZERO,
          pasivoPatrimonio: Money.ZERO,
        };
      case ClaseCuenta.INGRESO:
        return {
          perdidas: Money.ZERO,
          ganancias: saldoAjAcreedor,
          activo: Money.ZERO,
          pasivoPatrimonio: Money.ZERO,
        };
    }
  }

  // esContraria=true: el monto efectivo es el saldo del lado de su naturaleza, negado.
  // Si ACREEDORA → usa saldoAjAcreedor; si DEUDORA → usa saldoAjDeudor.
  const montoContraria =
    cuenta.naturaleza === NaturalezaCuenta.ACREEDORA ? saldoAjAcreedor : saldoAjDeudor;
  const montoNegado = montoContraria.mul(-1);

  switch (cuenta.claseCuenta) {
    case ClaseCuenta.ACTIVO:
      return {
        perdidas: Money.ZERO,
        ganancias: Money.ZERO,
        activo: montoNegado,
        pasivoPatrimonio: Money.ZERO,
      };
    case ClaseCuenta.PASIVO:
    case ClaseCuenta.PATRIMONIO:
      return {
        perdidas: Money.ZERO,
        ganancias: Money.ZERO,
        activo: Money.ZERO,
        pasivoPatrimonio: montoNegado,
      };
    case ClaseCuenta.EGRESO:
      return {
        perdidas: montoNegado,
        ganancias: Money.ZERO,
        activo: Money.ZERO,
        pasivoPatrimonio: Money.ZERO,
      };
    case ClaseCuenta.INGRESO:
      return {
        perdidas: Money.ZERO,
        ganancias: montoNegado,
        activo: Money.ZERO,
        pasivoPatrimonio: Money.ZERO,
      };
  }
}
