import { NaturalezaCuenta } from '@/common/domain/enums';
import { Money } from '@/common/domain/money';

import { netDe } from './signed-net';

describe('netDe — signed-net por cuenta hoja', () => {
  describe('net > 0 (saldo normal en su naturaleza)', () => {
    it('cuenta DEUDORA con saldo deudor → línea al lado OPUESTO (HABER)', () => {
      // EGRESO típico: debito 60000 > credito 0 → net = +60000
      const resultado = netDe(Money.of('60000.00'), Money.of('0.00'), NaturalezaCuenta.DEUDORA);
      expect(resultado).not.toBeNull();
      expect(resultado!.lado).toBe('HABER');
      expect(resultado!.monto.toBob()).toBe('60000.00');
    });

    it('cuenta ACREEDORA con saldo acreedor → línea al lado OPUESTO (DEBE)', () => {
      // INGRESO típico: credito 100000 > debito 0 → net = +100000
      const resultado = netDe(Money.of('0.00'), Money.of('100000.00'), NaturalezaCuenta.ACREEDORA);
      expect(resultado).not.toBeNull();
      expect(resultado!.lado).toBe('DEBE');
      expect(resultado!.monto.toBob()).toBe('100000.00');
    });

    it('toma el neto cuando hay débito y crédito en la misma cuenta DEUDORA', () => {
      // debito 60000, credito 10000 → net = +50000
      const resultado = netDe(Money.of('60000.00'), Money.of('10000.00'), NaturalezaCuenta.DEUDORA);
      expect(resultado!.lado).toBe('HABER');
      expect(resultado!.monto.toBob()).toBe('50000.00');
    });
  });

  describe('net < 0 (anomalía: saldo contrario a la naturaleza)', () => {
    it('cuenta DEUDORA con saldo acreedor → línea al MISMO lado (DEBE) por |net|', () => {
      // EGRESO anómalo: credito 500 > debito 0 → net = −500
      const resultado = netDe(Money.of('0.00'), Money.of('500.00'), NaturalezaCuenta.DEUDORA);
      expect(resultado).not.toBeNull();
      expect(resultado!.lado).toBe('DEBE');
      expect(resultado!.monto.toBob()).toBe('500.00');
    });

    it('cuenta ACREEDORA con saldo deudor → línea al MISMO lado (HABER) por |net|', () => {
      // INGRESO anómalo: debito 700 > credito 0 → net = −700
      const resultado = netDe(Money.of('700.00'), Money.of('0.00'), NaturalezaCuenta.ACREEDORA);
      expect(resultado).not.toBeNull();
      expect(resultado!.lado).toBe('HABER');
      expect(resultado!.monto.toBob()).toBe('700.00');
    });
  });

  describe('net === 0 (sin saldo neto)', () => {
    it('debito === credito → null (skip)', () => {
      const resultado = netDe(Money.of('1000.00'), Money.of('1000.00'), NaturalezaCuenta.DEUDORA);
      expect(resultado).toBeNull();
    });

    it('ambos en cero → null (skip)', () => {
      const resultado = netDe(Money.of('0.00'), Money.of('0.00'), NaturalezaCuenta.ACREEDORA);
      expect(resultado).toBeNull();
    });
  });
});
