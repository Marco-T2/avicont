import { Decimal } from '@prisma/client/runtime/library';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import type { CuentaEstructuraRow } from '../ports/eeff-saldos-reader.port';
import type { SaldoCuentaSeparadoRow } from '../ports/eeff-saldos-reader.port';
import { construirHojaTrabajo } from './hoja-trabajo';

/**
 * Tests del builder puro de la Hoja de Trabajo de 12 columnas.
 *
 * Cobertura objetivo ≥95% (§7.5). Cubre:
 *   - 12 columnas (REQ-HT-03..08)
 *   - filtrado de cuentas (REQ-HT-12, REQ-HT-20)
 *   - ajustes separados (REQ-HT-05, REQ-HT-06)
 *   - routing ER/BG (REQ-HT-07, REQ-HT-08)
 *   - cuenta contraria (D-05)
 *   - carry-over utilidad/pérdida (REQ-HT-09)
 *   - 6 cuadres (REQ-HT-10)
 *   - tolerancia ±0.01 (§4.1)
 *   - naturaleza opuesta sobre saldo ajustado (REQ-HT-18)
 *   - orden (REQ-HT-13) y robustez (REQ-HT-19, REQ-HT-20)
 */

// ============================================================
// Fixtures
// ============================================================

function cuenta(
  overrides: Partial<CuentaEstructuraRow> &
    Pick<CuentaEstructuraRow, 'id' | 'codigoInterno' | 'claseCuenta'>,
): CuentaEstructuraRow {
  return {
    parentId: null,
    nivel: 4,
    esDetalle: true,
    esContraria: false,
    subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    naturaleza: NaturalezaCuenta.DEUDORA,
    nombre: `Cuenta ${overrides.codigoInterno}`,
    actividadFlujo: null,
    ...overrides,
  };
}

function saldoSep(
  cuentaId: string,
  debitoOrdinario: string,
  creditoOrdinario: string,
  debitoAjuste: string = '0',
  creditoAjuste: string = '0',
): SaldoCuentaSeparadoRow {
  return {
    cuentaId,
    debitoOrdinarioBob: new Decimal(debitoOrdinario),
    creditoOrdinarioBob: new Decimal(creditoOrdinario),
    debitoAjusteBob: new Decimal(debitoAjuste),
    creditoAjusteBob: new Decimal(creditoAjuste),
  };
}

describe('construirHojaTrabajo', () => {
  // ============================================================
  // REQ-HT-12: reporte vacío
  // ============================================================

  describe('REQ-HT-12: reporte vacío (saldosSeparados y estructura vacíos)', () => {
    it('estructura y saldos vacíos → lineas=[], totales 0.00, cuadra=true', () => {
      const result = construirHojaTrabajo({ estructura: [], saldosSeparados: [] });

      expect(result.lineas).toEqual([]);
      expect(result.totales.sumasDebe.toBob()).toBe('0.00');
      expect(result.totales.sumasHaber.toBob()).toBe('0.00');
      expect(result.totales.saldoDeudor.toBob()).toBe('0.00');
      expect(result.totales.saldoAcreedor.toBob()).toBe('0.00');
      expect(result.totales.ajustesDebe.toBob()).toBe('0.00');
      expect(result.totales.ajustesHaber.toBob()).toBe('0.00');
      expect(result.totales.saldoAjustadoDeudor.toBob()).toBe('0.00');
      expect(result.totales.saldoAjustadoAcreedor.toBob()).toBe('0.00');
      expect(result.totales.perdidas.toBob()).toBe('0.00');
      expect(result.totales.ganancias.toBob()).toBe('0.00');
      expect(result.totales.activo.toBob()).toBe('0.00');
      expect(result.totales.pasivoPatrimonio.toBob()).toBe('0.00');
      expect(result.cuadres.cuadra).toBe(true);
      expect(result.cuentasNaturalezaOpuesta).toEqual([]);
    });

    it('estructura con cuentas pero sin saldos → reporte vacío cuadrado', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];

      const result = construirHojaTrabajo({ estructura, saldosSeparados: [] });

      expect(result.lineas).toEqual([]);
      expect(result.cuadres.cuadra).toBe(true);
    });
  });

  // ============================================================
  // REQ-HT-20: cuenta no en estructura → ignorada
  // ============================================================

  describe('REQ-HT-20: robustez ante saldo sin estructura', () => {
    it('fila de saldo con cuentaId ausente en estructura se ignora sin romper', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      const saldosSeparados = [saldoSep('c1', '1000', '0'), saldoSep('fantasma', '5000', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.lineas).toHaveLength(1);
      expect(result.lineas[0]!.cuentaId).toBe('c1');
      expect(result.totales.sumasDebe.toBob()).toBe('1000.00');
    });
  });

  // ============================================================
  // REQ-HT-12: cuenta con todos los 4 campos en cero → ignorada
  // ============================================================

  describe('REQ-HT-12: cuenta con movimiento cero descartada', () => {
    it('los 4 campos en cero → fila descartada', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      const saldosSeparados = [saldoSep('c1', '0', '0', '0', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.lineas).toHaveLength(0);
    });
  });

  // ============================================================
  // REQ-HT-03: sumasDebe / sumasHaber (columnas 1–2)
  // ============================================================

  describe('REQ-HT-03: sumasDebe / sumasHaber (columnas 1–2)', () => {
    it('debitoOrdinarioBob → sumasDebe; creditoOrdinarioBob → sumasHaber', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      const saldosSeparados = [saldoSep('c1', '1200', '400')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.lineas).toHaveLength(1);
      const linea = result.lineas[0]!;
      expect(linea.sumasDebe.toBob()).toBe('1200.00');
      expect(linea.sumasHaber.toBob()).toBe('400.00');
    });
  });

  // ============================================================
  // REQ-HT-04: saldoDeudor / saldoAcreedor (columnas 3–4)
  // ============================================================

  describe('REQ-HT-04: saldoDeudor / saldoAcreedor — mecánica universal (columnas 3–4)', () => {
    it('debe > haber → solo saldoDeudor positivo, saldoAcreedor=0', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      const saldosSeparados = [saldoSep('c1', '1000', '300')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.saldoDeudor.toBob()).toBe('700.00');
      expect(linea.saldoAcreedor.toBob()).toBe('0.00');
    });

    it('haber > debe → solo saldoAcreedor positivo, saldoDeudor=0', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '2101',
          claseCuenta: ClaseCuenta.PASIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '200', '900')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.saldoDeudor.toBob()).toBe('0.00');
      expect(linea.saldoAcreedor.toBob()).toBe('700.00');
    });

    it('debe = haber → ambos saldos en 0.00 (con movimiento)', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      const saldosSeparados = [saldoSep('c1', '500', '500')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.saldoDeudor.toBob()).toBe('0.00');
      expect(linea.saldoAcreedor.toBob()).toBe('0.00');
      expect(linea.sumasDebe.toBob()).toBe('500.00');
      expect(linea.sumasHaber.toBob()).toBe('500.00');
    });
  });

  // ============================================================
  // REQ-HT-05: ajustesDebe / ajustesHaber (columnas 5–6)
  // ============================================================

  describe('REQ-HT-05: ajustesDebe / ajustesHaber (columnas 5–6)', () => {
    it('debitoAjusteBob → ajustesDebe; creditoAjusteBob → ajustesHaber', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      const saldosSeparados = [saldoSep('c1', '1000', '0', '200', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.ajustesDebe.toBob()).toBe('200.00');
      expect(linea.ajustesHaber.toBob()).toBe('0.00');
    });

    it('sin ajuste → ajustesDebe y ajustesHaber en 0.00', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      const saldosSeparados = [saldoSep('c1', '1000', '200')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.ajustesDebe.toBob()).toBe('0.00');
      expect(linea.ajustesHaber.toBob()).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-HT-06: saldoAjustadoDeudor / saldoAjustadoAcreedor (columnas 7–8)
  // ============================================================

  describe('REQ-HT-06: saldoAjustadoDeudor / saldoAjustadoAcreedor (columnas 7–8)', () => {
    it('saldo deudor + ajuste debe → saldoAjustadoDeudor aumentado', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      // sumas: debe=1000, haber=200 → saldoDeudor=800; ajuste: debe=100
      const saldosSeparados = [saldoSep('c1', '1000', '200', '100', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.saldoAjustadoDeudor.toBob()).toBe('900.00');
      expect(linea.saldoAjustadoAcreedor.toBob()).toBe('0.00');
    });

    it('ajuste invierte el saldo — saldoAjustadoAcreedor surge donde había deudor', () => {
      const estructura = [
        cuenta({ id: 'c1', codigoInterno: '1101', claseCuenta: ClaseCuenta.ACTIVO }),
      ];
      // sumas: debe=100, haber=0 → saldoDeudor=100; ajuste haber=200 → invertido
      const saldosSeparados = [saldoSep('c1', '100', '0', '0', '200')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.saldoAjustadoDeudor.toBob()).toBe('0.00');
      expect(linea.saldoAjustadoAcreedor.toBob()).toBe('100.00');
    });

    it('cuenta solo-ajuste (sumas=0, solo ajuste) aparece en la lista', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '2101',
          claseCuenta: ClaseCuenta.PASIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      // sin movimiento ordinario, solo ajuste haber=350
      const saldosSeparados = [saldoSep('c1', '0', '0', '0', '350')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.lineas).toHaveLength(1);
      const linea = result.lineas[0]!;
      expect(linea.sumasDebe.toBob()).toBe('0.00');
      expect(linea.sumasHaber.toBob()).toBe('0.00');
      expect(linea.saldoDeudor.toBob()).toBe('0.00');
      expect(linea.saldoAcreedor.toBob()).toBe('0.00');
      expect(linea.ajustesHaber.toBob()).toBe('350.00');
      expect(linea.saldoAjustadoAcreedor.toBob()).toBe('350.00');
    });
  });

  // ============================================================
  // REQ-HT-07: routing Estado de Resultados (columnas 9–10)
  // ============================================================

  describe('REQ-HT-07: routing ER — EGRESO e INGRESO (columnas 9–10)', () => {
    it('EGRESO con saldoAjustadoDeudor → erPerdidas positiva, erGanancias=0, BG=0', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '3000', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.perdidas.toBob()).toBe('3000.00');
      expect(linea.ganancias.toBob()).toBe('0.00');
      expect(linea.activo.toBob()).toBe('0.00');
      expect(linea.pasivoPatrimonio.toBob()).toBe('0.00');
    });

    it('INGRESO con saldoAjustadoAcreedor → erGanancias positiva, erPerdidas=0, BG=0', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '0', '8000')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.ganancias.toBob()).toBe('8000.00');
      expect(linea.perdidas.toBob()).toBe('0.00');
      expect(linea.activo.toBob()).toBe('0.00');
      expect(linea.pasivoPatrimonio.toBob()).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-HT-08: routing Balance General (columnas 11–12)
  // ============================================================

  describe('REQ-HT-08: routing BG — ACTIVO, PASIVO, PATRIMONIO (columnas 11–12)', () => {
    it('ACTIVO con saldoAjustadoDeudor → bgActivo positivo, ER=0', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '5000', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.activo.toBob()).toBe('5000.00');
      expect(linea.pasivoPatrimonio.toBob()).toBe('0.00');
      expect(linea.perdidas.toBob()).toBe('0.00');
      expect(linea.ganancias.toBob()).toBe('0.00');
    });

    it('PASIVO con saldoAjustadoAcreedor → bgPasPat positivo, ER=0', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '2101',
          claseCuenta: ClaseCuenta.PASIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '0', '2000')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.pasivoPatrimonio.toBob()).toBe('2000.00');
      expect(linea.activo.toBob()).toBe('0.00');
      expect(linea.perdidas.toBob()).toBe('0.00');
      expect(linea.ganancias.toBob()).toBe('0.00');
    });

    it('PATRIMONIO con saldoAjustadoAcreedor → bgPasPat positivo, bgActivo=0, ER=0', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '3101',
          claseCuenta: ClaseCuenta.PATRIMONIO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '0', '15000')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.pasivoPatrimonio.toBob()).toBe('15000.00');
      expect(linea.activo.toBob()).toBe('0.00');
      expect(linea.perdidas.toBob()).toBe('0.00');
      expect(linea.ganancias.toBob()).toBe('0.00');
    });
  });

  // ============================================================
  // D-05: cuenta esContraria
  // ============================================================

  describe('D-05: cuenta esContraria', () => {
    it('ACTIVO esContraria=true, naturaleza=ACREEDORA → bgActivo negativo', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1201',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          esContraria: true,
        }),
      ];
      // crédito 1500 → saldoAjustadoAcreedor=1500; contraria → bgActivo=-1500
      const saldosSeparados = [saldoSep('c1', '0', '1500')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.activo.toBob()).toBe('-1500.00');
      expect(linea.pasivoPatrimonio.toBob()).toBe('0.00');
      // totales en bgActivo deben reflejar la resta
      expect(result.totales.activo.toBob()).toBe('-1500.00');
    });

    it('INGRESO esContraria=true, naturaleza=DEUDORA → erGanancias negativo (D-05)', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '4901',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          esContraria: true,
        }),
      ];
      // débito 500 → saldoAjustadoDeudor=500; contraria INGRESO → erGanancias=-500
      const saldosSeparados = [saldoSep('c1', '500', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const linea = result.lineas[0]!;
      expect(linea.ganancias.toBob()).toBe('-500.00');
      expect(linea.perdidas.toBob()).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-HT-09: carry-over — Utilidad del Ejercicio
  // ============================================================

  describe('REQ-HT-09: carry-over — Utilidad del Ejercicio', () => {
    it('ganancias > perdidas → fila sintética "Utilidad del Ejercicio" en perdidas y pasivoPatrimonio', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      // Ventas 10000, Gastos 7000 → Utilidad 3000
      const saldosSeparados = [saldoSep('c1', '0', '10000'), saldoSep('c2', '7000', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const sintetica = result.lineas.find((l) => l.esSintetica);
      expect(sintetica).toBeDefined();
      expect(sintetica!.nombre).toBe('Utilidad del Ejercicio');
      expect(sintetica!.cuentaId).toBeNull();
      expect(sintetica!.codigoInterno).toBeNull();
      expect(sintetica!.esSintetica).toBe(true);
      // Va en perdidas (ER) y pasivoPatrimonio (BG)
      expect(sintetica!.perdidas.toBob()).toBe('3000.00');
      expect(sintetica!.pasivoPatrimonio.toBob()).toBe('3000.00');
      expect(sintetica!.ganancias.toBob()).toBe('0.00');
      expect(sintetica!.activo.toBob()).toBe('0.00');
    });

    it('post carry-over: ΣerPerdidas = ΣerGanancias = 10000 (ER cuadra)', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '0', '10000'), saldoSep('c2', '7000', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      // Con fila sintética incluida, perdidas = 7000 + 3000 = 10000 = ganancias
      expect(result.totales.perdidas.toBob()).toBe('10000.00');
      expect(result.totales.ganancias.toBob()).toBe('10000.00');
      expect(result.cuadres.cuadraEstadoResultados).toBe(true);
    });

    it('BG cuadra después de carry-over (pasivoPatrimonio aumenta con utilidad)', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '2101',
          claseCuenta: ClaseCuenta.PASIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c3',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c4',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      // Activo: Caja 10000 (DB caja / CR ventas)
      // Pasivo: 7000 (DB gastos / CR pasivo)
      // Ventas 10000, Gastos 7000 → Utilidad 3000 → pasivoPatrimonio += 3000
      const saldosSeparados = [
        saldoSep('c1', '10000', '0'),
        saldoSep('c2', '0', '7000'),
        saldoSep('c3', '0', '10000'),
        saldoSep('c4', '7000', '0'),
      ];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      // BG: activo=10000, pasivoPatrimonio=7000+3000=10000
      expect(result.totales.activo.toBob()).toBe('10000.00');
      expect(result.totales.pasivoPatrimonio.toBob()).toBe('10000.00');
      expect(result.cuadres.cuadraBalanceGeneral).toBe(true);
    });
  });

  // ============================================================
  // REQ-HT-09: carry-over — Pérdida del Ejercicio
  // ============================================================

  describe('REQ-HT-09: carry-over — Pérdida del Ejercicio', () => {
    it('perdidas > ganancias → fila sintética "Pérdida del Ejercicio" en ganancias y activo', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      // Ventas 5000, Gastos 9000 → Pérdida 4000
      const saldosSeparados = [saldoSep('c1', '0', '5000'), saldoSep('c2', '9000', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const sintetica = result.lineas.find((l) => l.esSintetica);
      expect(sintetica).toBeDefined();
      expect(sintetica!.nombre).toBe('Pérdida del Ejercicio');
      expect(sintetica!.cuentaId).toBeNull();
      expect(sintetica!.codigoInterno).toBeNull();
      expect(sintetica!.esSintetica).toBe(true);
      // Va en ganancias (ER) y activo (BG)
      expect(sintetica!.ganancias.toBob()).toBe('4000.00');
      expect(sintetica!.activo.toBob()).toBe('4000.00');
      expect(sintetica!.perdidas.toBob()).toBe('0.00');
      expect(sintetica!.pasivoPatrimonio.toBob()).toBe('0.00');
    });

    it('post carry-over: ΣerPerdidas = ΣerGanancias = 9000 (ER cuadra)', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '0', '5000'), saldoSep('c2', '9000', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.totales.perdidas.toBob()).toBe('9000.00');
      expect(result.totales.ganancias.toBob()).toBe('9000.00');
      expect(result.cuadres.cuadraEstadoResultados).toBe(true);
    });
  });

  // ============================================================
  // REQ-HT-09: carry-over cero → sin fila sintética
  // ============================================================

  describe('REQ-HT-09: carry-over cero → sin fila sintética', () => {
    it('ganancias = perdidas → sin fila sintética, lineas solo de detalle', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '0', '5000'), saldoSep('c2', '5000', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const sinteticas = result.lineas.filter((l) => l.esSintetica);
      expect(sinteticas).toHaveLength(0);
      expect(result.lineas).toHaveLength(2);
    });
  });

  // ============================================================
  // REQ-HT-10: 6 cuadres
  // ============================================================

  describe('REQ-HT-10: 6 cuadres — casos balanceado y desbalanceado', () => {
    it('reporte balanceado → cuadra=true + los 6 cuadra*=true, diferencias=0.00', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      // Partida doble perfecta
      const saldosSeparados = [saldoSep('c1', '1000', '0'), saldoSep('c2', '0', '1000')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.cuadres.cuadra).toBe(true);
      expect(result.cuadres.cuadraSumas).toBe(true);
      expect(result.cuadres.cuadraSaldos).toBe(true);
      expect(result.cuadres.cuadraAjustes).toBe(true);
      expect(result.cuadres.cuadraSaldosAjustados).toBe(true);
      expect(result.cuadres.cuadraEstadoResultados).toBe(true);
      expect(result.cuadres.cuadraBalanceGeneral).toBe(true);
      expect(result.cuadres.diferenciaSumas.toBob()).toBe('0.00');
      expect(result.cuadres.diferenciaSaldos.toBob()).toBe('0.00');
      expect(result.cuadres.diferenciaAjustes.toBob()).toBe('0.00');
      expect(result.cuadres.diferenciaSaldosAjustados.toBob()).toBe('0.00');
      expect(result.cuadres.diferenciaEstadoResultados.toBob()).toBe('0.00');
      expect(result.cuadres.diferenciaBalanceGeneral.toBob()).toBe('0.00');
    });

    it('desbalance en sumas → cuadraSumas=false, cuadra=false, diferenciaSumas refleja la diferencia', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      // Solo débito, sin contraparte → sumasDebe=100, sumasHaber=0
      const saldosSeparados = [saldoSep('c1', '100', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.cuadres.cuadraSumas).toBe(false);
      expect(result.cuadres.cuadra).toBe(false);
      expect(result.cuadres.diferenciaSumas.toBob()).toBe('100.00');
    });
  });

  // ============================================================
  // REQ-HT-10: tolerancia ±0.01
  // ============================================================

  describe('REQ-HT-10: tolerancia ±0.01 (§4.1)', () => {
    it('diferencia de 0.01 → cuadraSumas=true', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '1000.00', '0'), saldoSep('c2', '0', '999.99')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.cuadres.cuadraSumas).toBe(true);
    });

    it('diferencia de 0.02 → cuadraSumas=false', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '1000.00', '0'), saldoSep('c2', '0', '999.98')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.cuadres.cuadraSumas).toBe(false);
    });
  });

  // ============================================================
  // REQ-HT-18: cuentasNaturalezaOpuesta sobre saldo ajustado
  // ============================================================

  describe('REQ-HT-18: cuentasNaturalezaOpuesta sobre saldo ajustado', () => {
    it('cuenta DEUDORA con saldoAjustadoAcreedor>0 aparece en cuentasNaturalezaOpuesta', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      // Saldo ajustado del lado acreedor: debe 50, haber 200 → saldoAjustadoAcreedor=150
      const saldosSeparados = [saldoSep('c1', '50', '200')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.cuentasNaturalezaOpuesta).toHaveLength(1);
      const opuesta = result.cuentasNaturalezaOpuesta[0]!;
      expect(opuesta.cuentaId).toBe('c1');
      expect(opuesta.naturaleza).toBe(NaturalezaCuenta.DEUDORA);
      expect(opuesta.saldoOpuesto.toBob()).toBe('150.00');
    });

    it('cuenta ACREEDORA con saldoAjustadoDeudor>0 aparece en cuentasNaturalezaOpuesta', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '2101',
          claseCuenta: ClaseCuenta.PASIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '300', '100')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.cuentasNaturalezaOpuesta).toHaveLength(1);
      expect(result.cuentasNaturalezaOpuesta[0]!.saldoOpuesto.toBob()).toBe('200.00');
    });

    it('todas las cuentas con saldo del lado correcto → lista vacía', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '2101',
          claseCuenta: ClaseCuenta.PASIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '500', '100'), saldoSep('c2', '100', '500')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.cuentasNaturalezaOpuesta).toEqual([]);
    });

    it('naturaleza opuesta NO afecta los totales', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      const saldosSeparados = [saldoSep('c1', '50', '200')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      // Totales reflejan los movimientos
      expect(result.totales.sumasDebe.toBob()).toBe('50.00');
      expect(result.totales.sumasHaber.toBob()).toBe('200.00');
    });
  });

  // ============================================================
  // REQ-HT-13: orden por codigoInterno ASC + fila sintética al final
  // ============================================================

  describe('REQ-HT-13: orden por codigoInterno ASC, fila sintética al final', () => {
    it('cuentas desordenadas → salen ordenadas ASC con la fila sintética al final', () => {
      const estructura = [
        cuenta({
          id: 'c3',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '2101',
          claseCuenta: ClaseCuenta.PASIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c4',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
      ];
      // Ventas 10000, Gastos 7000 → utilidad 3000
      const saldosSeparados = [
        saldoSep('c3', '7000', '0'),
        saldoSep('c1', '10000', '0'),
        saldoSep('c2', '0', '10000'),
        saldoSep('c4', '0', '10000'),
      ];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      const codigos = result.lineas.map((l) => l.codigoInterno);
      // 4 de detalle ordenadas + fila sintética al final (codigoInterno=null)
      expect(codigos[0]).toBe('1101');
      expect(codigos[1]).toBe('2101');
      expect(codigos[2]).toBe('4101');
      expect(codigos[3]).toBe('5101');
      expect(codigos[4]).toBeNull(); // fila sintética al final
    });
  });

  // ============================================================
  // REQ-HT-19: cuenta agrupadora nunca aparece
  // ============================================================

  describe('REQ-HT-19: cuenta agrupadora (esDetalle=false) nunca aparece como fila', () => {
    it('agrupadora con saldo (patológico) → ignorada', () => {
      const estructura = [
        cuenta({
          id: 'g1',
          codigoInterno: '11',
          esDetalle: false,
          claseCuenta: ClaseCuenta.ACTIVO,
        }),
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          parentId: 'g1',
          claseCuenta: ClaseCuenta.ACTIVO,
        }),
      ];
      const saldosSeparados = [saldoSep('g1', '9999', '0'), saldoSep('c1', '100', '0')];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.lineas).toHaveLength(1);
      expect(result.lineas[0]!.cuentaId).toBe('c1');
    });
  });

  // ============================================================
  // Totales: verificación pre-carry-over
  // ============================================================

  describe('totales pre-carry-over: las 12 columnas suman correctamente', () => {
    it('múltiples cuentas → totales correctos en las 12 columnas', () => {
      const estructura = [
        cuenta({
          id: 'c1',
          codigoInterno: '1101',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
        cuenta({
          id: 'c2',
          codigoInterno: '4101',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
        }),
        cuenta({
          id: 'c3',
          codigoInterno: '5101',
          claseCuenta: ClaseCuenta.EGRESO,
          naturaleza: NaturalezaCuenta.DEUDORA,
        }),
      ];
      const saldosSeparados = [
        saldoSep('c1', '3000', '0'),
        saldoSep('c2', '0', '5000'),
        saldoSep('c3', '2000', '0'),
      ];

      const result = construirHojaTrabajo({ estructura, saldosSeparados });

      expect(result.totales.sumasDebe.toBob()).toBe('5000.00');
      expect(result.totales.sumasHaber.toBob()).toBe('5000.00');
      expect(result.totales.saldoDeudor.toBob()).toBe('5000.00');
      expect(result.totales.saldoAcreedor.toBob()).toBe('5000.00');
      // BG: activo 3000
      // ER: ganancias 5000, perdidas 2000+3000(carryover)=5000
      // Los totales ER incluyen el carry-over
      expect(result.totales.ganancias.toBob()).toBe('5000.00');
      expect(result.totales.perdidas.toBob()).toBe('5000.00');
    });
  });
});
