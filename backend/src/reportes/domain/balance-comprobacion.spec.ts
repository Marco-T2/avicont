import { Decimal } from '@prisma/client/runtime/library';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';
import { construirBalanceComprobacion } from './balance-comprobacion';

/**
 * Tests del builder puro del Balance de Comprobación de Sumas y Saldos.
 *
 * Cobertura objetivo ≥95% (§7.5). Cubre la mecánica de las 4 columnas (REQ-BC-03),
 * filtrado de cuentas (REQ-BC-04), orden (REQ-BC-05), totales/cuadre (REQ-BC-06),
 * naturaleza opuesta (REQ-BC-07), reporte vacío (REQ-BC-12) y robustez (REQ-BC-13).
 */

// ============================================================
// Fixtures
// ============================================================

function cuenta(
  overrides: Partial<CuentaEstructuraRow> & Pick<CuentaEstructuraRow, 'id' | 'codigoInterno'>,
): CuentaEstructuraRow {
  return {
    parentId: null,
    nivel: 4,
    esDetalle: true,
    esContraria: false,
    claseCuenta: ClaseCuenta.ACTIVO,
    subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    naturaleza: NaturalezaCuenta.DEUDORA,
    nombre: `Cuenta ${overrides.codigoInterno}`,
    actividadFlujo: null,
    ...overrides,
  };
}

function saldo(cuentaId: string, debito: string, credito: string): SaldoCuentaRow {
  return {
    cuentaId,
    totalDebitoBob: new Decimal(debito),
    totalCreditoBob: new Decimal(credito),
  };
}

describe('construirBalanceComprobacion', () => {
  // ============================================================
  // REQ-BC-03: Cuatro columnas por cuenta
  // ============================================================

  describe('REQ-BC-03: cuatro columnas por cuenta de detalle', () => {
    it('débito > crédito → saldoDeudor positivo, saldoAcreedor cero', () => {
      const estructura = [cuenta({ id: 'c1', codigoInterno: '1101' })];
      const saldosRango = [saldo('c1', '1000.00', '300.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.lineas).toHaveLength(1);
      const linea = result.lineas[0]!;
      expect(linea.sumasDebito.toBob()).toBe('1000.00');
      expect(linea.sumasCredito.toBob()).toBe('300.00');
      expect(linea.saldoDeudor.toBob()).toBe('700.00');
      expect(linea.saldoAcreedor.toBob()).toBe('0.00');
    });

    it('crédito > débito → saldoAcreedor positivo, saldoDeudor cero', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '2101', naturaleza: NaturalezaCuenta.ACREEDORA }),
      ];
      const saldosRango = [saldo('c1', '200.00', '900.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      const linea = result.lineas[0]!;
      expect(linea.saldoDeudor.toBob()).toBe('0.00');
      expect(linea.saldoAcreedor.toBob()).toBe('700.00');
    });

    it('débito = crédito (saldo cero pero con movimiento) → presente con ambos saldos cero', () => {
      const estructura = [cuenta({ id: 'c1', codigoInterno: '1101' })];
      const saldosRango = [saldo('c1', '500.00', '500.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.lineas).toHaveLength(1);
      const linea = result.lineas[0]!;
      expect(linea.sumasDebito.toBob()).toBe('500.00');
      expect(linea.sumasCredito.toBob()).toBe('500.00');
      expect(linea.saldoDeudor.toBob()).toBe('0.00');
      expect(linea.saldoAcreedor.toBob()).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-BC-04: Solo cuentas de detalle con movimiento
  // ============================================================

  describe('REQ-BC-04: solo cuentas de detalle con movimiento', () => {
    it('cuenta de detalle sin fila de saldo se omite', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101' }),
        cuenta({ id: 'c2', codigoInterno: '1102' }),
      ];
      const saldosRango = [saldo('c1', '100.00', '0.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.lineas).toHaveLength(1);
      expect(result.lineas[0]!.cuentaId).toBe('c1');
    });

    it('cuenta de detalle con débito y crédito ambos cero se omite (defensivo)', () => {
      const estructura = [cuenta({ id: 'c1', codigoInterno: '1101' })];
      const saldosRango = [saldo('c1', '0.00', '0.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.lineas).toHaveLength(0);
    });

    it('cuenta agrupadora (esDetalle=false) nunca aparece como fila', () => {
      const estructura = [
        cuenta({ id: 'g1', codigoInterno: '11', esDetalle: false }),
        cuenta({ id: 'c1', codigoInterno: '1101', parentId: 'g1' }),
      ];
      // Aunque el port devolviera (patológicamente) un saldo para la agrupadora,
      // no debe aparecer.
      const saldosRango = [saldo('g1', '9999.00', '0.00'), saldo('c1', '100.00', '0.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.lineas).toHaveLength(1);
      expect(result.lineas[0]!.cuentaId).toBe('c1');
    });
  });

  // ============================================================
  // REQ-BC-05: Orden por codigoInterno ASC
  // ============================================================

  describe('REQ-BC-05: orden por codigoInterno ASC', () => {
    it('ordena las líneas por codigoInterno ascendente', () => {
      const estructura = [
        cuenta({ id: 'c3', codigoInterno: '4101', naturaleza: NaturalezaCuenta.ACREEDORA }),
        cuenta({ id: 'c1', codigoInterno: '1101' }),
        cuenta({ id: 'c2', codigoInterno: '1102' }),
      ];
      const saldosRango = [
        saldo('c3', '0.00', '500.00'),
        saldo('c1', '100.00', '0.00'),
        saldo('c2', '200.00', '0.00'),
      ];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.lineas.map((l) => l.codigoInterno)).toEqual(['1101', '1102', '4101']);
    });
  });

  // ============================================================
  // REQ-BC-06: Totales y cuadre
  // ============================================================

  describe('REQ-BC-06: totales de las cuatro columnas e invariantes de cuadre', () => {
    it('reporte cuadrado: cuadra=true, diferencias 0.00, sumas iguales', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101' }),
        cuenta({ id: 'c2', codigoInterno: '4101', naturaleza: NaturalezaCuenta.ACREEDORA }),
      ];
      // Partida doble: débito total = crédito total = 1000
      const saldosRango = [saldo('c1', '1000.00', '0.00'), saldo('c2', '0.00', '1000.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.totalSumasDebito.toBob()).toBe('1000.00');
      expect(result.totalSumasCredito.toBob()).toBe('1000.00');
      expect(result.totalSaldoDeudor.toBob()).toBe('1000.00');
      expect(result.totalSaldoAcreedor.toBob()).toBe('1000.00');
      expect(result.cuadra).toBe(true);
      expect(result.diferenciaSumas.toBob()).toBe('0.00');
      expect(result.diferenciaSaldos.toBob()).toBe('0.00');
    });

    it('tolerancia ±0.01: descuadre de 0.01 sigue cuadrando', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101' }),
        cuenta({ id: 'c2', codigoInterno: '4101', naturaleza: NaturalezaCuenta.ACREEDORA }),
      ];
      const saldosRango = [saldo('c1', '1000.00', '0.00'), saldo('c2', '0.00', '999.99')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.cuadra).toBe(true);
    });

    it('descuadre detectado: cuadra=false y diferenciaSumas refleja la diferencia exacta', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101' }),
        cuenta({ id: 'c2', codigoInterno: '4101', naturaleza: NaturalezaCuenta.ACREEDORA }),
      ];
      // Datos corruptos: débito 1000, crédito 700 → descuadre de 300
      const saldosRango = [saldo('c1', '1000.00', '0.00'), saldo('c2', '0.00', '700.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.cuadra).toBe(false);
      expect(result.diferenciaSumas.toBob()).toBe('300.00');
      expect(result.diferenciaSaldos.toBob()).toBe('300.00');
    });
  });

  // ============================================================
  // REQ-BC-07: Cuentas de naturaleza opuesta
  // ============================================================

  describe('REQ-BC-07: cuentas de naturaleza opuesta', () => {
    it('cuenta DEUDORA con saldoAcreedor aparece con su saldo opuesto', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', naturaleza: NaturalezaCuenta.DEUDORA }),
      ];
      // Saldo cae del lado acreedor (crédito > débito) pese a ser DEUDORA
      const saldosRango = [saldo('c1', '50.00', '200.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.cuentasNaturalezaOpuesta).toHaveLength(1);
      const opuesta = result.cuentasNaturalezaOpuesta[0]!;
      expect(opuesta.cuentaId).toBe('c1');
      expect(opuesta.naturaleza).toBe(NaturalezaCuenta.DEUDORA);
      expect(opuesta.saldoOpuesto.toBob()).toBe('150.00');
    });

    it('cuenta ACREEDORA con saldoDeudor aparece con su saldo opuesto', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '2101', naturaleza: NaturalezaCuenta.ACREEDORA }),
      ];
      const saldosRango = [saldo('c1', '300.00', '100.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.cuentasNaturalezaOpuesta).toHaveLength(1);
      expect(result.cuentasNaturalezaOpuesta[0]!.saldoOpuesto.toBob()).toBe('200.00');
    });

    it('todas las cuentas con saldo de su naturaleza → lista vacía', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', naturaleza: NaturalezaCuenta.DEUDORA }),
        cuenta({ id: 'c2', codigoInterno: '2101', naturaleza: NaturalezaCuenta.ACREEDORA }),
      ];
      const saldosRango = [saldo('c1', '500.00', '100.00'), saldo('c2', '100.00', '500.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.cuentasNaturalezaOpuesta).toEqual([]);
    });

    it('cuenta con saldo cero (débito=crédito) no cuenta como naturaleza opuesta', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', naturaleza: NaturalezaCuenta.DEUDORA }),
      ];
      const saldosRango = [saldo('c1', '500.00', '500.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.cuentasNaturalezaOpuesta).toEqual([]);
    });

    it('naturaleza opuesta NO afecta los totales', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', naturaleza: NaturalezaCuenta.DEUDORA }),
      ];
      const saldosRango = [saldo('c1', '50.00', '200.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.totalSumasDebito.toBob()).toBe('50.00');
      expect(result.totalSumasCredito.toBob()).toBe('200.00');
      expect(result.totalSaldoAcreedor.toBob()).toBe('150.00');
    });
  });

  // ============================================================
  // REQ-BC-12: Reporte vacío cuadrado
  // ============================================================

  describe('REQ-BC-12: estructura/saldos vacíos', () => {
    it('estructura y saldos vacíos → lineas vacías, totales 0.00, cuadra=true', () => {
      const result = construirBalanceComprobacion({ estructura: [], saldosRango: [] });

      expect(result.lineas).toEqual([]);
      expect(result.totalSumasDebito.toBob()).toBe('0.00');
      expect(result.totalSumasCredito.toBob()).toBe('0.00');
      expect(result.totalSaldoDeudor.toBob()).toBe('0.00');
      expect(result.totalSaldoAcreedor.toBob()).toBe('0.00');
      expect(result.cuadra).toBe(true);
      expect(result.diferenciaSumas.toBob()).toBe('0.00');
      expect(result.diferenciaSaldos.toBob()).toBe('0.00');
      expect(result.cuentasNaturalezaOpuesta).toEqual([]);
    });

    it('estructura con cuentas pero sin saldos → reporte vacío cuadrado', () => {
      const estructura = [cuenta({ id: 'c1', codigoInterno: '1101' })];

      const result = construirBalanceComprobacion({ estructura, saldosRango: [] });

      expect(result.lineas).toEqual([]);
      expect(result.cuadra).toBe(true);
    });
  });

  // ============================================================
  // REQ-BC-13: Robustez ante saldo sin estructura
  // ============================================================

  describe('REQ-BC-13: robustez ante desajuste estructura ↔ saldos', () => {
    it('fila de saldo con cuentaId ausente en la estructura se ignora sin romper', () => {
      const estructura = [cuenta({ id: 'c1', codigoInterno: '1101' })];
      // 'fantasma' no existe en la estructura (cuenta desactivada con movimiento histórico)
      const saldosRango = [saldo('c1', '100.00', '0.00'), saldo('fantasma', '5000.00', '0.00')];

      const result = construirBalanceComprobacion({ estructura, saldosRango });

      expect(result.lineas).toHaveLength(1);
      expect(result.lineas[0]!.cuentaId).toBe('c1');
      // El saldo fantasma no afecta los totales
      expect(result.totalSumasDebito.toBob()).toBe('100.00');
    });
  });
});
