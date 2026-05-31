import { NaturalezaCuenta } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { Money } from '@/common/domain/money';

import { calcularSaldoNeto } from './saldo-naturaleza';

// ============================================================
// Tests: calcularSaldoNeto
// REQ-BG-16, REQ-BG-05
// ============================================================

describe('calcularSaldoNeto', () => {
  describe('naturaleza DEUDORA (activos/egresos)', () => {
    it('saldo = debe − haber (resultado positivo)', () => {
      const resultado = calcularSaldoNeto(
        new Decimal('5000.00'),
        new Decimal('1200.00'),
        NaturalezaCuenta.DEUDORA,
      );
      expect(resultado.toBob()).toBe('3800.00');
    });

    it('saldo negativo válido (más créditos que débitos)', () => {
      const resultado = calcularSaldoNeto(
        new Decimal('100.00'),
        new Decimal('400.00'),
        NaturalezaCuenta.DEUDORA,
      );
      expect(resultado.toBob()).toBe('-300.00');
    });

    it('saldo cero cuando ambos lados son iguales', () => {
      const resultado = calcularSaldoNeto(
        new Decimal('500.00'),
        new Decimal('500.00'),
        NaturalezaCuenta.DEUDORA,
      );
      expect(resultado.toBob()).toBe('0.00');
    });
  });

  describe('naturaleza ACREEDORA (pasivos/patrimonio/ingresos)', () => {
    it('saldo = haber − debe (resultado positivo)', () => {
      const resultado = calcularSaldoNeto(
        new Decimal('2000.00'),
        new Decimal('8000.00'),
        NaturalezaCuenta.ACREEDORA,
      );
      expect(resultado.toBob()).toBe('6000.00');
    });

    it('saldo negativo válido (más débitos que créditos en cuenta ACREEDORA)', () => {
      const resultado = calcularSaldoNeto(
        new Decimal('3000.00'),
        new Decimal('1000.00'),
        NaturalezaCuenta.ACREEDORA,
      );
      expect(resultado.toBob()).toBe('-2000.00');
    });

    it('saldo cero cuando ambos lados son iguales', () => {
      const resultado = calcularSaldoNeto(
        new Decimal('200.00'),
        new Decimal('200.00'),
        NaturalezaCuenta.ACREEDORA,
      );
      expect(resultado.toBob()).toBe('0.00');
    });
  });

  describe('acepta distintos tipos de entrada', () => {
    it('acepta string como parámetros', () => {
      const resultado = calcularSaldoNeto('1000.00', '300.00', NaturalezaCuenta.DEUDORA);
      expect(resultado.toBob()).toBe('700.00');
    });

    it('acepta instancias de Money como parámetros', () => {
      const debe = Money.of('1500.00');
      const haber = Money.of('500.00');
      const resultado = calcularSaldoNeto(debe, haber, NaturalezaCuenta.DEUDORA);
      expect(resultado.toBob()).toBe('1000.00');
    });

    it('acepta instancias de Decimal como parámetros', () => {
      const resultado = calcularSaldoNeto(
        new Decimal('750.00'),
        new Decimal('250.00'),
        NaturalezaCuenta.ACREEDORA,
      );
      expect(resultado.toBob()).toBe('-500.00');
    });
  });
});
