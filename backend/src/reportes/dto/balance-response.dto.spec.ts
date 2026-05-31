import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@prisma/client';

import { Money } from '@/common/domain/money';

import type { BalanceArbolResult, CuentaBalanceCalculada, SubseccionCalculada } from './balance-response.dto';
import { toBalanceResponse, formatFechaContable } from './balance-response.dto';

// ============================================================
// Tests: mapper balance-response.dto
// REQ-BG-09, REQ-BG-11, REQ-BG-15
// ============================================================

function makeCuentaCalculada(overrides: Partial<CuentaBalanceCalculada> = {}): CuentaBalanceCalculada {
  return {
    cuentaId: 'cuenta-1',
    codigoInterno: '1.1.1.001',
    nombre: 'Caja MN',
    nivel: 4,
    esContraria: false,
    esSintetica: false,
    saldoBob: Money.of('1250.50'),
    ...overrides,
  };
}

function makeSubseccion(
  subClaseCuenta: SubClaseCuenta,
  cuentas: CuentaBalanceCalculada[],
  total: Money,
): SubseccionCalculada {
  return { subClaseCuenta, titulo: subClaseCuenta, cuentas, totalBob: total };
}

describe('formatFechaContable', () => {
  it('formatea Date UTC a "YYYY-MM-DD"', () => {
    const date = new Date(Date.UTC(2026, 4, 31)); // 31-mayo-2026
    expect(formatFechaContable(date)).toBe('2026-05-31');
  });

  it('incluye padding de ceros en mes y día', () => {
    const date = new Date(Date.UTC(2026, 0, 5)); // 05-enero-2026
    expect(formatFechaContable(date)).toBe('2026-01-05');
  });
});

describe('toBalanceResponse', () => {
  const fechaCorte = new Date(Date.UTC(2026, 4, 31)); // 2026-05-31
  const gestionId = 'gestion-uuid-1234';

  it('serializa Money como string con 2 decimales fijos (REQ-BG-15)', () => {
    const cuentaActivo = makeCuentaCalculada({ saldoBob: Money.of('1250.5') });
    const subseccion = makeSubseccion(
      SubClaseCuenta.ACTIVO_CORRIENTE,
      [cuentaActivo],
      Money.of('1250.5'),
    );
    const arbol: BalanceArbolResult = {
      activo: { claseCuenta: ClaseCuenta.ACTIVO, titulo: 'Activo', subsecciones: [subseccion], totalBob: Money.of('1250.5') },
      pasivo: { claseCuenta: ClaseCuenta.PASIVO, titulo: 'Pasivo', subsecciones: [], totalBob: Money.ZERO },
      patrimonio: { claseCuenta: ClaseCuenta.PATRIMONIO, titulo: 'Patrimonio', subsecciones: [], totalBob: Money.ZERO },
      resultadoEjercicioBob: Money.ZERO,
      cuadra: false,
      diferenciaBob: Money.of('1250.5'),
    };

    const result = toBalanceResponse(arbol, { fechaCorte, gestionId });

    expect(result.activo.subsecciones[0]!.cuentas[0]!.saldoBob).toBe('1250.50');
    expect(result.activo.subsecciones[0]!.totalBob).toBe('1250.50');
    expect(result.totalActivoBob).toBe('1250.50');
  });

  it('fecha de corte como "YYYY-MM-DD" en la respuesta (REQ-BG-15)', () => {
    const arbol: BalanceArbolResult = {
      activo: { claseCuenta: ClaseCuenta.ACTIVO, titulo: 'Activo', subsecciones: [], totalBob: Money.ZERO },
      pasivo: { claseCuenta: ClaseCuenta.PASIVO, titulo: 'Pasivo', subsecciones: [], totalBob: Money.ZERO },
      patrimonio: { claseCuenta: ClaseCuenta.PATRIMONIO, titulo: 'Patrimonio', subsecciones: [], totalBob: Money.ZERO },
      resultadoEjercicioBob: Money.ZERO,
      cuadra: true,
      diferenciaBob: Money.ZERO,
    };

    const result = toBalanceResponse(arbol, { fechaCorte, gestionId });

    expect(result.fechaCorte).toBe('2026-05-31');
    expect(result.gestionId).toBe(gestionId);
  });

  it('estructura activo.subsecciones[].grupos[] correcta (REQ-BG-10, REQ-BG-15)', () => {
    const cuentaActivo = makeCuentaCalculada();
    const subseccion = makeSubseccion(
      SubClaseCuenta.ACTIVO_CORRIENTE,
      [cuentaActivo],
      Money.of('1250.50'),
    );
    const arbol: BalanceArbolResult = {
      activo: {
        claseCuenta: ClaseCuenta.ACTIVO,
        titulo: 'Activo',
        subsecciones: [subseccion],
        totalBob: Money.of('1250.50'),
      },
      pasivo: { claseCuenta: ClaseCuenta.PASIVO, titulo: 'Pasivo', subsecciones: [], totalBob: Money.ZERO },
      patrimonio: { claseCuenta: ClaseCuenta.PATRIMONIO, titulo: 'Patrimonio', subsecciones: [], totalBob: Money.ZERO },
      resultadoEjercicioBob: Money.ZERO,
      cuadra: true,
      diferenciaBob: Money.ZERO,
    };

    const result = toBalanceResponse(arbol, { fechaCorte, gestionId });

    expect(result.activo.claseCuenta).toBe('ACTIVO');
    expect(result.activo.subsecciones).toHaveLength(1);
    expect(result.activo.subsecciones[0]!.subClaseCuenta).toBe('ACTIVO_CORRIENTE');
    expect(result.activo.subsecciones[0]!.cuentas).toHaveLength(1);
    expect(result.activo.subsecciones[0]!.cuentas[0]!.cuentaId).toBe('cuenta-1');
  });

  it('resultadoEjercicioBob como string decimal (REQ-BG-09)', () => {
    const arbol: BalanceArbolResult = {
      activo: { claseCuenta: ClaseCuenta.ACTIVO, titulo: 'Activo', subsecciones: [], totalBob: Money.ZERO },
      pasivo: { claseCuenta: ClaseCuenta.PASIVO, titulo: 'Pasivo', subsecciones: [], totalBob: Money.ZERO },
      patrimonio: { claseCuenta: ClaseCuenta.PATRIMONIO, titulo: 'Patrimonio', subsecciones: [], totalBob: Money.of('5000.00') },
      resultadoEjercicioBob: Money.of('5000.00'),
      cuadra: true,
      diferenciaBob: Money.ZERO,
    };

    const result = toBalanceResponse(arbol, { fechaCorte, gestionId });

    expect(result.resultadoEjercicioBob).toBe('5000.00');
    expect(typeof result.resultadoEjercicioBob).toBe('string');
  });

  it('resultadoEjercicioBob negativo (pérdida) como string negativo (REQ-BG-09)', () => {
    const arbol: BalanceArbolResult = {
      activo: { claseCuenta: ClaseCuenta.ACTIVO, titulo: 'Activo', subsecciones: [], totalBob: Money.ZERO },
      pasivo: { claseCuenta: ClaseCuenta.PASIVO, titulo: 'Pasivo', subsecciones: [], totalBob: Money.ZERO },
      patrimonio: { claseCuenta: ClaseCuenta.PATRIMONIO, titulo: 'Patrimonio', subsecciones: [], totalBob: Money.of('-10000.00') },
      resultadoEjercicioBob: Money.of('-10000.00'),
      cuadra: true,
      diferenciaBob: Money.ZERO,
    };

    const result = toBalanceResponse(arbol, { fechaCorte, gestionId });

    expect(result.resultadoEjercicioBob).toBe('-10000.00');
  });

  it('cuadra: true cuando diferencia es 0 (REQ-BG-11)', () => {
    const arbol: BalanceArbolResult = {
      activo: { claseCuenta: ClaseCuenta.ACTIVO, titulo: 'Activo', subsecciones: [], totalBob: Money.ZERO },
      pasivo: { claseCuenta: ClaseCuenta.PASIVO, titulo: 'Pasivo', subsecciones: [], totalBob: Money.ZERO },
      patrimonio: { claseCuenta: ClaseCuenta.PATRIMONIO, titulo: 'Patrimonio', subsecciones: [], totalBob: Money.ZERO },
      resultadoEjercicioBob: Money.ZERO,
      cuadra: true,
      diferenciaBob: Money.ZERO,
    };

    const result = toBalanceResponse(arbol, { fechaCorte, gestionId });

    expect(result.cuadra).toBe(true);
    expect(result.diferenciaBob).toBe('0.00');
  });

  it('cuadra: false con diferencia en string (REQ-BG-11)', () => {
    const arbol: BalanceArbolResult = {
      activo: { claseCuenta: ClaseCuenta.ACTIVO, titulo: 'Activo', subsecciones: [], totalBob: Money.ZERO },
      pasivo: { claseCuenta: ClaseCuenta.PASIVO, titulo: 'Pasivo', subsecciones: [], totalBob: Money.ZERO },
      patrimonio: { claseCuenta: ClaseCuenta.PATRIMONIO, titulo: 'Patrimonio', subsecciones: [], totalBob: Money.ZERO },
      resultadoEjercicioBob: Money.ZERO,
      cuadra: false,
      diferenciaBob: Money.of('1.50'),
    };

    const result = toBalanceResponse(arbol, { fechaCorte, gestionId });

    expect(result.cuadra).toBe(false);
    expect(result.diferenciaBob).toBe('1.50');
  });

  it('línea sintética tiene cuentaId null y esSintetica true (REQ-BG-09)', () => {
    const lineaSintetica = makeCuentaCalculada({
      cuentaId: null,
      codigoInterno: null,
      nombre: 'Resultado del Ejercicio (en curso)',
      esSintetica: true,
      saldoBob: Money.of('3000.00'),
    });
    const subseccion = makeSubseccion(
      SubClaseCuenta.PATRIMONIO_RESULTADOS,
      [lineaSintetica],
      Money.of('3000.00'),
    );
    const arbol: BalanceArbolResult = {
      activo: { claseCuenta: ClaseCuenta.ACTIVO, titulo: 'Activo', subsecciones: [], totalBob: Money.ZERO },
      pasivo: { claseCuenta: ClaseCuenta.PASIVO, titulo: 'Pasivo', subsecciones: [], totalBob: Money.ZERO },
      patrimonio: {
        claseCuenta: ClaseCuenta.PATRIMONIO,
        titulo: 'Patrimonio',
        subsecciones: [subseccion],
        totalBob: Money.of('3000.00'),
      },
      resultadoEjercicioBob: Money.of('3000.00'),
      cuadra: false,
      diferenciaBob: Money.of('3000.00'),
    };

    const result = toBalanceResponse(arbol, { fechaCorte, gestionId });

    const patrimonioResultados = result.patrimonio.subsecciones.find(
      (s) => s.subClaseCuenta === 'PATRIMONIO_RESULTADOS',
    );
    expect(patrimonioResultados).toBeDefined();
    const linea = patrimonioResultados!.cuentas.find((c) => c.esSintetica);
    expect(linea).toBeDefined();
    expect(linea!.cuentaId).toBeNull();
    expect(linea!.esSintetica).toBe(true);
  });
});
