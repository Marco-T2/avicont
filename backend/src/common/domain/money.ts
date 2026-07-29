/**
 * Value object para montos monetarios — CLAUDE.md §4.5 (dominio contable).
 *
 * Reglas del dominio que encapsula:
 *   - Aritmética exacta sobre decimal (no float IEEE-754).
 *   - Redondeo a 2 decimales para BOB/USD: **half-up**, política única de la
 *     casa. Para PERSISTIR un monto calculado usar `redondearABob()`, que lo
 *     hace explícito; `toBob()` es FORMATO (devuelve `string`) y aplica la
 *     misma política vía `Prisma.Decimal.toFixed`. Half-up es también lo que
 *     hace Postgres `numeric(18,2)`, así que las tres capas coinciden.
 *   - Tolerancia de partida doble: ±Bs 0.01 (Código Tributario art. 47,
 *     originada en redondeos de conversión multi-moneda).
 *
 * Implementación: envuelve `Prisma.Decimal` (que internamente usa decimal.js)
 * para consolidar en un único punto todo el uso runtime de la lib decimal
 * del proyecto. El resto del código debería operar con `Money` y nunca
 * instanciar `new Prisma.Decimal(...)` por su cuenta — así la semántica de
 * "dinero" queda bien definida y el día que se cambie el engine decimal
 * (por ejemplo a `decimal.js` puro) se toca un solo archivo.
 */

import { Prisma } from '@prisma/client';

type DecimalInput = string | number | Prisma.Decimal | Money;

function toDecimal(v: DecimalInput): Prisma.Decimal {
  if (v instanceof Money) return v.amount;
  if (v instanceof Prisma.Decimal) return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new RangeError(`Money: número no finito (${v})`);
    }
    return new Prisma.Decimal(v);
  }
  if (typeof v === 'string') {
    if (v.length === 0) {
      throw new RangeError('Money: string vacío');
    }
    try {
      return new Prisma.Decimal(v);
    } catch {
      throw new RangeError(`Money: valor inválido "${v}"`);
    }
  }
  throw new RangeError(`Money: tipo inválido ${typeof v}`);
}

export class Money {
  private constructor(readonly amount: Prisma.Decimal) {}

  static readonly ZERO = new Money(new Prisma.Decimal(0));

  /** Tolerancia global para comparaciones monetarias en BOB (±Bs 0.01). */
  static readonly TOLERANCIA_BOB = new Money(new Prisma.Decimal('0.01'));

  static of(value: DecimalInput): Money {
    return new Money(toDecimal(value));
  }

  // ------------------------------------------------------------
  // Aritmética
  // ------------------------------------------------------------

  plus(other: DecimalInput): Money {
    return new Money(this.amount.plus(toDecimal(other)));
  }

  minus(other: DecimalInput): Money {
    return new Money(this.amount.minus(toDecimal(other)));
  }

  mul(factor: DecimalInput): Money {
    return new Money(this.amount.mul(toDecimal(factor)));
  }

  div(divisor: number): Money {
    if (divisor === 0) {
      throw new RangeError('Money: division por cero');
    }
    return new Money(this.amount.div(divisor).toDecimalPlaces(2));
  }

  abs(): Money {
    return new Money(this.amount.abs());
  }

  /**
   * Redondea a 2 decimales (moneda) con la política ÚNICA de la casa:
   * **half-up**. Es el método que hay que usar antes de PERSISTIR cualquier
   * monto derivado de un cálculo — típicamente `cantidad × precioUnitario`.
   *
   * Por qué half-up y no half-even: es la política que ya aplican las otras
   * dos capas donde el sistema redondea dinero — `div()` (`toDecimalPlaces`)
   * y Postgres `numeric(18,2)` (verificado: `31.525 → 31.53`,
   * `0.005 → 0.01`). Redondear half-even acá desalinearía TypeScript de la
   * base: cualquier valor que llegara al INSERT sin pasar por este método
   * quedaría redondeado distinto por Postgres.
   *
   * Por qué existe: `mul()` NO redondea y `toBob()` devuelve `string`
   * (formato). Sin este método, el redondeo terminaba ocurriendo dentro de
   * Postgres al insertar — invisible y fuera del dominio (Anti-04). Y un
   * total derivado de valores crudos NO coincide con la suma de los
   * subtotales persistidos: con 3 líneas de `10.005`, `10.01 × 3 = 30.03`
   * pero `30.015 → 30.02`. Regla: sumar SIEMPRE subtotales ya redondeados.
   */
  redondearABob(): Money {
    return new Money(this.amount.toDecimalPlaces(2));
  }

  // ------------------------------------------------------------
  // Comparaciones
  // ------------------------------------------------------------

  equals(other: DecimalInput): boolean {
    return this.amount.equals(toDecimal(other));
  }

  greaterThan(other: DecimalInput): boolean {
    return this.amount.greaterThan(toDecimal(other));
  }

  greaterThanOrEqualTo(other: DecimalInput): boolean {
    return this.amount.greaterThanOrEqualTo(toDecimal(other));
  }

  lessThan(other: DecimalInput): boolean {
    return this.amount.lessThan(toDecimal(other));
  }

  lessThanOrEqualTo(other: DecimalInput): boolean {
    return this.amount.lessThanOrEqualTo(toDecimal(other));
  }

  isZero(): boolean {
    return this.amount.equals(0);
  }

  isPositive(): boolean {
    return this.amount.greaterThan(0);
  }

  isNegative(): boolean {
    return this.amount.lessThan(0);
  }

  /**
   * true si |this - other| <= ±Bs 0.01 — condición de partida doble
   * balanceada en BOB tras conversiones multi-moneda.
   */
  balanceadoEnBobCon(other: DecimalInput): boolean {
    return this.minus(other).abs().lessThanOrEqualTo(Money.TOLERANCIA_BOB);
  }

  /**
   * true si |this - other| <= tolerancia. **Currency-neutral**: a diferencia
   * de `balanceadoEnBobCon`/`TOLERANCIA_BOB` (semántica BOB del invariante de
   * partida doble, CLAUDE.md §4.1 — no tocar), este método no asume moneda.
   *
   * PRECONDICIÓN: el caller garantiza que `this` y `other` están en la MISMA
   * moneda — este método no la conoce ni la valida. Usado por conciliación
   * bancaria (design conciliacion-bancaria §8.0) para comparar montos en
   * moneda original (BOB o USD) en el ancla (§2), el motor de sugerencias
   * (§5.2) y el checksum de extracto (§4.2), siempre después de filtrar por
   * igualdad de moneda en el caller.
   */
  igualaConTolerancia(other: DecimalInput, tolerancia: Money = Money.of('0.01')): boolean {
    return this.minus(other).abs().lessThanOrEqualTo(tolerancia);
  }

  // ------------------------------------------------------------
  // Formato
  // ------------------------------------------------------------

  /** Representación BOB/USD con 2 decimales. Usar en DTOs y responses. */
  toBob(): string {
    return this.amount.toFixed(2);
  }

  toString(): string {
    return this.amount.toString();
  }

  /** Expone el `Prisma.Decimal` interno para pasarlo a queries de Prisma. */
  toPrismaDecimal(): Prisma.Decimal {
    return this.amount;
  }
}
