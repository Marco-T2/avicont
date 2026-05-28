/**
 * Validador puro del dominio de comprobantes. Funciones sin side effects,
 * sin acceso a BD, sin NestJS, sin reloj. Testeable en milisegundos.
 *
 * Concentra los invariantes estructurales del §4.1 del CLAUDE.md core
 * (dominio contable) que se pueden chequear sin consultar otras entidades:
 *
 *   1. Glosa obligatoria y no vacía.
 *   2. Mínimo 2 líneas para contabilizar.
 *   3. Partida doble: SUM(debitoBob) = SUM(creditoBob), tolerancia ±Bs 0.01
 *      (Código Tributario art. 47, tolerancia por redondeo de conversión).
 *   4. Monto total > 0 (no se contabiliza un asiento de Bs 0).
 *   5. Por línea: XOR débito/crédito — solo uno puede ser > 0.
 *   6. Por línea: coherencia montoBob ≈ monto × tipoCambio (±0.01).
 *   7. Por línea: tipoCambio > 0; si moneda=BOB entonces tipoCambio=1.
 *   8. fechaContable <= hoyEnLaPaz (no asientos al futuro).
 *
 * Las validaciones que dependen de leer otra entidad (cuenta activa,
 * cuenta esDetalle, cuenta requiereContacto, cuenta permiteMultiMoneda)
 * viven en el servicio porque requieren I/O contra el repo de cuentas.
 */

import type { Prisma } from '@prisma/client';

import { Moneda } from '@/common/domain/enums';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import {
  ComprobanteDesbalanceadoError,
  ComprobanteMontoCeroError,
  ComprobanteSinLineasError,
  FechaFuturaNoPermitidaError,
  GlosaRequeridaError,
  LineaAmbiguaDebitoCreditoError,
  LineaSinMontoError,
  MontoBobIncoherenteError,
  TipoCambioInvalidoError,
} from './comprobante-errors';

/** Mínimo de líneas para contabilizar (un asiento necesita al menos un DEBE y un HABER). */
export const MIN_LINEAS_CONTABILIZADO = 2;

export interface LineaParaValidar {
  orden: number;
  moneda: Moneda;
  debito: string | Prisma.Decimal;
  credito: string | Prisma.Decimal;
  tipoCambio: string | Prisma.Decimal;
  debitoBob: string | Prisma.Decimal;
  creditoBob: string | Prisma.Decimal;
}

/**
 * Valida todos los invariantes estructurales del comprobante. Se invoca
 * al contabilizar (BORRADOR → CONTABILIZADO). El borrador puede estar
 * desbalanceado y con menos de 2 líneas mientras se edita — esas reglas
 * solo se enforzan en este punto.
 *
 * @throws {DomainError} alguna subclase específica según el invariante roto.
 */
export function validarComprobanteParaContabilizar(input: {
  glosa: string;
  lineas: LineaParaValidar[];
  fechaContable: FechaContable;
  hoy: FechaContable;
}): void {
  validarGlosa(input.glosa);
  validarFechaNoFutura(input.fechaContable, input.hoy);
  validarMinimoLineas(input.lineas);

  for (const linea of input.lineas) {
    validarLinea(linea);
  }

  validarPartidaDoble(input.lineas);
  validarMontoPositivo(input.lineas);
}

// ------------------------------------------------------------
// Validadores individuales (exportados para tests granulares y reuso)
// ------------------------------------------------------------

export function validarGlosa(glosa: string): void {
  if (typeof glosa !== 'string' || glosa.trim().length === 0) {
    throw new GlosaRequeridaError();
  }
}

export function validarFechaNoFutura(fecha: FechaContable, hoy: FechaContable): void {
  if (fecha.isAfter(hoy)) {
    throw new FechaFuturaNoPermitidaError(fecha.toIso(), hoy.toIso());
  }
}

export function validarMinimoLineas(lineas: { length: number }): void {
  if (lineas.length < MIN_LINEAS_CONTABILIZADO) {
    throw new ComprobanteSinLineasError(lineas.length);
  }
}

export function validarLinea(linea: LineaParaValidar): void {
  const debito = Money.of(linea.debito);
  const credito = Money.of(linea.credito);
  const tipoCambio = Money.of(linea.tipoCambio);
  const debitoBob = Money.of(linea.debitoBob);
  const creditoBob = Money.of(linea.creditoBob);

  // XOR: una línea tiene DEBE O HABER, nunca ambos, nunca ninguno.
  const tieneDebito = debito.isPositive();
  const tieneCredito = credito.isPositive();
  if (tieneDebito && tieneCredito) {
    throw new LineaAmbiguaDebitoCreditoError(linea.orden);
  }
  if (!tieneDebito && !tieneCredito) {
    throw new LineaSinMontoError(linea.orden);
  }

  // Débito/crédito no-negativos (la comparación >0 ya los cubre pero seamos explícitos).
  if (debito.isNegative() || credito.isNegative()) {
    throw new LineaSinMontoError(linea.orden);
  }

  // Tipo de cambio: > 0 siempre, y si moneda = BOB debe ser exactamente 1.
  if (tipoCambio.lessThanOrEqualTo(0)) {
    throw new TipoCambioInvalidoError(linea.orden, {
      moneda: linea.moneda,
      tipoCambio: tipoCambio.toString(),
    });
  }
  if (linea.moneda === Moneda.BOB && !tipoCambio.equals(1)) {
    throw new TipoCambioInvalidoError(linea.orden, {
      moneda: linea.moneda,
      tipoCambio: tipoCambio.toString(),
    });
  }

  // Coherencia en BOB: montoBob ≈ monto × tipoCambio, tolerancia ±0.01.
  // Validamos el lado no-cero (el otro debe ser 0 también en BOB).
  if (tieneDebito) {
    const esperado = debito.mul(tipoCambio);
    assertMontoBobCoherente(linea.orden, debito, tipoCambio, esperado, debitoBob);
    if (!creditoBob.isZero()) {
      throw new MontoBobIncoherenteError(linea.orden, {
        monto: credito.toString(),
        tipoCambio: tipoCambio.toString(),
        montoBobEsperado: '0.00',
        montoBobRecibido: creditoBob.toString(),
      });
    }
  } else {
    const esperado = credito.mul(tipoCambio);
    assertMontoBobCoherente(linea.orden, credito, tipoCambio, esperado, creditoBob);
    if (!debitoBob.isZero()) {
      throw new MontoBobIncoherenteError(linea.orden, {
        monto: debito.toString(),
        tipoCambio: tipoCambio.toString(),
        montoBobEsperado: '0.00',
        montoBobRecibido: debitoBob.toString(),
      });
    }
  }
}

export function validarPartidaDoble(lineas: LineaParaValidar[]): void {
  const totales = calcularTotalesBob(lineas);
  if (!totales.debito.balanceadoEnBobCon(totales.credito)) {
    const diff = totales.debito.minus(totales.credito).abs();
    throw new ComprobanteDesbalanceadoError(
      totales.debito.toBob(),
      totales.credito.toBob(),
      diff.toBob(),
    );
  }
}

export function validarMontoPositivo(lineas: LineaParaValidar[]): void {
  const totales = calcularTotalesBob(lineas);
  // Código Tributario art. 47: no se contabiliza un comprobante de Bs 0.
  if (totales.debito.lessThanOrEqualTo(0) && totales.credito.lessThanOrEqualTo(0)) {
    throw new ComprobanteMontoCeroError();
  }
}

export function calcularTotalesBob(lineas: LineaParaValidar[]): {
  debito: Money;
  credito: Money;
} {
  return lineas.reduce(
    (acc, l) => ({
      debito: acc.debito.plus(l.debitoBob),
      credito: acc.credito.plus(l.creditoBob),
    }),
    { debito: Money.ZERO, credito: Money.ZERO },
  );
}

// ------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------

function assertMontoBobCoherente(
  orden: number,
  monto: Money,
  tipoCambio: Money,
  esperado: Money,
  recibido: Money,
): void {
  if (!esperado.balanceadoEnBobCon(recibido)) {
    throw new MontoBobIncoherenteError(orden, {
      monto: monto.toString(),
      tipoCambio: tipoCambio.toString(),
      montoBobEsperado: esperado.toBob(),
      montoBobRecibido: recibido.toBob(),
    });
  }
}
