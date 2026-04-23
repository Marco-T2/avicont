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

import { Moneda } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { FechaContable } from '@/common/domain/fecha-contable';

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

/** Tolerancia global para comparaciones monetarias en BOB (±Bs 0.01). */
export const TOLERANCIA_BOB = new Prisma.Decimal('0.01');
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
  const debito = toDecimal(linea.debito);
  const credito = toDecimal(linea.credito);
  const tipoCambio = toDecimal(linea.tipoCambio);
  const debitoBob = toDecimal(linea.debitoBob);
  const creditoBob = toDecimal(linea.creditoBob);

  // XOR: una línea tiene DEBE O HABER, nunca ambos, nunca ninguno.
  const tieneDebito = debito.greaterThan(0);
  const tieneCredito = credito.greaterThan(0);
  if (tieneDebito && tieneCredito) {
    throw new LineaAmbiguaDebitoCreditoError(linea.orden);
  }
  if (!tieneDebito && !tieneCredito) {
    throw new LineaSinMontoError(linea.orden);
  }

  // Débito/crédito no-negativos (la comparación >0 ya los cubre pero seamos explícitos).
  if (debito.lessThan(0) || credito.lessThan(0)) {
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
    if (!creditoBob.equals(0)) {
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
    if (!debitoBob.equals(0)) {
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
  const diff = totales.debito.minus(totales.credito).abs();
  if (diff.greaterThan(TOLERANCIA_BOB)) {
    throw new ComprobanteDesbalanceadoError(
      totales.debito.toFixed(2),
      totales.credito.toFixed(2),
      diff.toFixed(2),
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
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
} {
  return lineas.reduce(
    (acc, l) => ({
      debito: acc.debito.plus(toDecimal(l.debitoBob)),
      credito: acc.credito.plus(toDecimal(l.creditoBob)),
    }),
    { debito: new Prisma.Decimal(0), credito: new Prisma.Decimal(0) },
  );
}

// ------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------

function toDecimal(v: string | Prisma.Decimal): Prisma.Decimal {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

function assertMontoBobCoherente(
  orden: number,
  monto: Prisma.Decimal,
  tipoCambio: Prisma.Decimal,
  esperado: Prisma.Decimal,
  recibido: Prisma.Decimal,
): void {
  const diff = esperado.minus(recibido).abs();
  if (diff.greaterThan(TOLERANCIA_BOB)) {
    throw new MontoBobIncoherenteError(orden, {
      monto: monto.toString(),
      tipoCambio: tipoCambio.toString(),
      montoBobEsperado: esperado.toFixed(2),
      montoBobRecibido: recibido.toFixed(2),
    });
  }
}
