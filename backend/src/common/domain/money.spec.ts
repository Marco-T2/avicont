import { Prisma } from '@prisma/client';

import { Money } from './money';

describe('Money.of', () => {
  it.each([
    ['1000', '1000'],
    ['1000.50', '1000.5'],
    ['0', '0'],
    ['-250.75', '-250.75'],
  ])('acepta string "%s"', (raw, expected) => {
    expect(Money.of(raw).toString()).toBe(expected);
  });

  it('acepta number finito', () => {
    expect(Money.of(1000.5).toString()).toBe('1000.5');
  });

  it('acepta Prisma.Decimal', () => {
    const d = new Prisma.Decimal('1234.56');
    expect(Money.of(d).toString()).toBe('1234.56');
  });

  it('acepta otro Money (idempotente)', () => {
    const a = Money.of('1000');
    const b = Money.of(a);
    expect(b.equals(a)).toBe(true);
  });

  it('rechaza Infinity', () => {
    expect(() => Money.of(Infinity)).toThrow(/no finito/);
  });

  it('rechaza NaN', () => {
    expect(() => Money.of(NaN)).toThrow(/no finito/);
  });

  it('rechaza string vacío', () => {
    expect(() => Money.of('')).toThrow(/string vacío/);
  });

  it('rechaza string inválido', () => {
    expect(() => Money.of('abc')).toThrow(/inválido/);
  });
});

describe('Money aritmética', () => {
  it('plus suma montos', () => {
    expect(Money.of('100.50').plus('25.25').toBob()).toBe('125.75');
  });

  it('minus resta montos', () => {
    expect(Money.of('100').minus('25.25').toBob()).toBe('74.75');
  });

  it('mul multiplica por factor', () => {
    expect(Money.of('100').mul('6.96').toBob()).toBe('696.00');
  });

  it('abs devuelve valor absoluto', () => {
    expect(Money.of('-50.50').abs().toBob()).toBe('50.50');
  });

  it('operaciones son inmutables (no mutan el original)', () => {
    const a = Money.of('100');
    a.plus('50');
    expect(a.toBob()).toBe('100.00');
  });
});

describe('Money comparaciones', () => {
  const cien = Money.of('100');

  it('equals con string, number, Money', () => {
    expect(cien.equals('100')).toBe(true);
    expect(cien.equals(100)).toBe(true);
    expect(cien.equals(Money.of('100'))).toBe(true);
    expect(cien.equals('99.99')).toBe(false);
  });

  it('greaterThan / lessThan', () => {
    expect(cien.greaterThan('99')).toBe(true);
    expect(cien.lessThan('101')).toBe(true);
    expect(cien.greaterThanOrEqualTo('100')).toBe(true);
    expect(cien.lessThanOrEqualTo('100')).toBe(true);
  });

  it('isZero / isPositive / isNegative', () => {
    expect(Money.ZERO.isZero()).toBe(true);
    expect(Money.of('10').isPositive()).toBe(true);
    expect(Money.of('-10').isNegative()).toBe(true);
    expect(Money.of('10').isNegative()).toBe(false);
  });
});

describe('Money.balanceadoEnBobCon (tolerancia ±0.01)', () => {
  it('diferencia 0 → balanceado', () => {
    expect(Money.of('1000').balanceadoEnBobCon('1000')).toBe(true);
  });

  it('diferencia 0.01 → balanceado (en el límite)', () => {
    expect(Money.of('1000.00').balanceadoEnBobCon('1000.01')).toBe(true);
    expect(Money.of('1000.01').balanceadoEnBobCon('1000.00')).toBe(true);
  });

  it('diferencia 0.02 → NO balanceado', () => {
    expect(Money.of('1000.00').balanceadoEnBobCon('1000.02')).toBe(false);
  });

  it('descompensación grande no balancea', () => {
    expect(Money.of('1000').balanceadoEnBobCon('900')).toBe(false);
  });
});

describe('Money formato', () => {
  it('toBob siempre 2 decimales', () => {
    expect(Money.of('1000').toBob()).toBe('1000.00');
    expect(Money.of('1000.5').toBob()).toBe('1000.50');
    expect(Money.of('0').toBob()).toBe('0.00');
  });

  it('toPrismaDecimal expone el decimal interno', () => {
    const m = Money.of('1234.56');
    expect(m.toPrismaDecimal()).toBeInstanceOf(Prisma.Decimal);
    expect(m.toPrismaDecimal().toFixed(2)).toBe('1234.56');
  });
});

describe('Money constantes', () => {
  it('ZERO es cero', () => {
    expect(Money.ZERO.toBob()).toBe('0.00');
    expect(Money.ZERO.isZero()).toBe(true);
  });

  it('TOLERANCIA_BOB es 0.01', () => {
    expect(Money.TOLERANCIA_BOB.toBob()).toBe('0.01');
  });
});

describe('Money.div', () => {
  it('divide exactamente sin redondeo', () => {
    expect(Money.of('75000').div(5000).toBob()).toBe('15.00');
  });

  it('divide con redondeo half-up a 2 decimales', () => {
    expect(Money.of('75000').div(4900).toBob()).toBe('15.31');
  });

  it('divide número entero exacto', () => {
    expect(Money.of('30').div(3).toBob()).toBe('10.00');
  });

  it('redondea hacia abajo cuando corresponde (1/3 → 0.33)', () => {
    expect(Money.of('1').div(3).toBob()).toBe('0.33');
  });

  it('devuelve una nueva instancia (inmutabilidad)', () => {
    const original = Money.of('100');
    const resultado = original.div(4);
    expect(original.toBob()).toBe('100.00');
    expect(resultado.toBob()).toBe('25.00');
  });

  it('lanza RangeError al dividir por cero', () => {
    expect(() => Money.of('100').div(0)).toThrow(RangeError);
    expect(() => Money.of('100').div(0)).toThrow(/division por cero/);
  });
});
