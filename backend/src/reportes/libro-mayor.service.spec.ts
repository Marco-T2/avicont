import { Decimal } from '@prisma/client/runtime/library';

import { NaturalezaCuenta } from '@/common/domain/enums';
import { ConfigService } from '@nestjs/config';

import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import {
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  FiltroRequeridoError,
  MovimientosExcedenLimiteError,
  PeriodoNoEncontradoError,
  RangoInvalidoError,
} from './domain/libro-mayor-errors';
import { LibroMayorService, LIBRO_MAYOR_MAX_MOVIMIENTOS_DEFAULT } from './libro-mayor.service';
import type {
  LibroMayorReaderPort,
  MovimientoMayorRow,
  SaldoInicialRow,
} from './ports/libro-mayor-reader.port';

// ============================================================
// Mocks tipados (§7.8 CLAUDE.md — nunca se mockea Prisma directamente)
// ============================================================

type MockLibroMayorReader = {
  [K in keyof LibroMayorReaderPort]: jest.Mock;
};
type MockPeriodosReader = {
  [K in keyof Pick<PeriodosReaderPort, 'obtenerRangoFechas'>]: jest.Mock;
};

function makeLibroMayorReaderMock(): MockLibroMayorReader {
  return {
    contarMovimientos: jest.fn(),
    obtenerMovimientos: jest.fn(),
    obtenerSaldosIniciales: jest.fn(),
    obtenerCuentaDetalle: jest.fn(),
  };
}

function makePeriodosReaderMock(): MockPeriodosReader {
  return {
    obtenerRangoFechas: jest.fn(),
  };
}

/** Crea un ConfigService stub con el límite indicado para LIBRO_MAYOR_MAX_MOVIMIENTOS. */
function makeConfigService(
  maxMovimientos: number = LIBRO_MAYOR_MAX_MOVIMIENTOS_DEFAULT,
): ConfigService {
  return {
    get: (_key: string, defaultVal?: number) => {
      if (_key === 'LIBRO_MAYOR_MAX_MOVIMIENTOS') return maxMovimientos;
      return defaultVal;
    },
  } as unknown as ConfigService;
}

// ============================================================
// Fixtures
// ============================================================

function makeMovimientoRow(overrides: Partial<MovimientoMayorRow> = {}): MovimientoMayorRow {
  return {
    cuentaId: 'cuenta-1',
    codigoInterno: '1.1.1.001',
    nombreCuenta: 'Caja MN',
    naturaleza: NaturalezaCuenta.DEUDORA,
    comprobanteId: 'comp-1',
    numeroComprobante: 'D2601-000001',
    fechaContable: new Date('2026-01-15T00:00:00Z'),
    glosa: 'Venta',
    glosaLinea: null,
    estado: 'CONTABILIZADO',
    anulado: false,
    orden: 1,
    debitoBob: new Decimal('1000.00'),
    creditoBob: new Decimal('0.00'),
    ...overrides,
  };
}

function makeSaldoInicialRow(overrides: Partial<SaldoInicialRow> = {}): SaldoInicialRow {
  return {
    cuentaId: 'cuenta-1',
    codigoInterno: '1.1.1.001',
    nombreCuenta: 'Caja MN',
    naturaleza: NaturalezaCuenta.DEUDORA,
    totalDebitoBob: new Decimal('500.00'),
    totalCreditoBob: new Decimal('0.00'),
    ...overrides,
  };
}

const TENANT_ID = 'org-test-1';
const LIMIT_TEST = 10;

// ============================================================
// Tests
// ============================================================

describe('LibroMayorService (unit)', () => {
  let service: LibroMayorService;
  let mayorReader: MockLibroMayorReader;
  let periodosReader: MockPeriodosReader;

  beforeEach(() => {
    mayorReader = makeLibroMayorReaderMock();
    periodosReader = makePeriodosReaderMock();
    service = new LibroMayorService(
      mayorReader as unknown as LibroMayorReaderPort,
      periodosReader as unknown as PeriodosReaderPort,
      makeConfigService(LIMIT_TEST),
    );

    // Default mocks para happy path (sin cuentaId, sin saldo previo, sin movimientos)
    mayorReader.contarMovimientos.mockResolvedValue(0);
    mayorReader.obtenerMovimientos.mockResolvedValue([]);
    mayorReader.obtenerSaldosIniciales.mockResolvedValue([]);
    mayorReader.obtenerCuentaDetalle.mockResolvedValue(null);
  });

  // ============================================================
  // Validación de filtros (REQ-LM-01)
  // ============================================================

  describe('validación de filtros', () => {
    it('lanza FiltroRequeridoError si no se recibe ningún filtro de rango', async () => {
      await expect(
        service.consultarLibroMayor(TENANT_ID, { incluirAnulados: false, soloConMovimiento: true }),
      ).rejects.toThrow(FiltroRequeridoError);
    });

    it('lanza FiltroRequeridoError si se reciben periodoFiscalId + fechaDesde simultáneamente', async () => {
      await expect(
        service.consultarLibroMayor(TENANT_ID, {
          periodoFiscalId: 'periodo-uuid',
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
          incluirAnulados: false,
          soloConMovimiento: true,
        }),
      ).rejects.toThrow(FiltroRequeridoError);
    });

    it('lanza FiltroRequeridoError si se recibe fechaDesde sin fechaHasta', async () => {
      await expect(
        service.consultarLibroMayor(TENANT_ID, {
          fechaDesde: '2026-01-01',
          incluirAnulados: false,
          soloConMovimiento: true,
        }),
      ).rejects.toThrow(FiltroRequeridoError);
    });

    it('lanza FiltroRequeridoError si se recibe fechaHasta sin fechaDesde', async () => {
      await expect(
        service.consultarLibroMayor(TENANT_ID, {
          fechaHasta: '2026-01-31',
          incluirAnulados: false,
          soloConMovimiento: true,
        }),
      ).rejects.toThrow(FiltroRequeridoError);
    });

    it('lanza RangoInvalidoError si fechaDesde > fechaHasta', async () => {
      await expect(
        service.consultarLibroMayor(TENANT_ID, {
          fechaDesde: '2026-01-31',
          fechaHasta: '2026-01-01',
          incluirAnulados: false,
          soloConMovimiento: true,
        }),
      ).rejects.toThrow(RangoInvalidoError);
    });
  });

  // ============================================================
  // Resolución de período (REQ-LM-13)
  // ============================================================

  describe('resolución de período', () => {
    it('lanza PeriodoNoEncontradoError si obtenerRangoFechas devuelve null', async () => {
      periodosReader.obtenerRangoFechas.mockResolvedValue(null);

      await expect(
        service.consultarLibroMayor(TENANT_ID, {
          periodoFiscalId: 'periodo-inexistente',
          incluirAnulados: false,
          soloConMovimiento: true,
        }),
      ).rejects.toThrow(PeriodoNoEncontradoError);

      expect(periodosReader.obtenerRangoFechas).toHaveBeenCalledWith(
        TENANT_ID,
        'periodo-inexistente',
      );
    });

    it('resuelve periodoFiscalId a rango de fechas y pasa al adapter', async () => {
      const rango = {
        desde: new Date('2026-01-01T00:00:00Z'),
        hasta: new Date('2026-01-31T00:00:00Z'),
      };
      periodosReader.obtenerRangoFechas.mockResolvedValue(rango);

      await service.consultarLibroMayor(TENANT_ID, {
        periodoFiscalId: 'periodo-enero',
        incluirAnulados: false,
        soloConMovimiento: true,
      });

      expect(mayorReader.contarMovimientos).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ fechaDesde: rango.desde, fechaHasta: rango.hasta }),
      );
    });
  });

  // ============================================================
  // Validación de cuenta (REQ-LM-07)
  // ============================================================

  describe('validación de cuenta', () => {
    const baseQuery = {
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-31',
      incluirAnulados: false,
      soloConMovimiento: true,
    };

    it('lanza CuentaNoEncontradaError (404) si obtenerCuentaDetalle devuelve null', async () => {
      mayorReader.obtenerCuentaDetalle.mockResolvedValue(null);

      await expect(
        service.consultarLibroMayor(TENANT_ID, { ...baseQuery, cuentaId: 'cuenta-inexistente' }),
      ).rejects.toThrow(CuentaNoEncontradaError);
    });

    it('lanza CuentaNoDetalleError (400) si obtenerCuentaDetalle devuelve esDetalle=false', async () => {
      mayorReader.obtenerCuentaDetalle.mockResolvedValue({
        id: 'cuenta-agrupadora',
        esDetalle: false,
      });

      await expect(
        service.consultarLibroMayor(TENANT_ID, { ...baseQuery, cuentaId: 'cuenta-agrupadora' }),
      ).rejects.toThrow(CuentaNoDetalleError);
    });

    it('no llama a obtenerCuentaDetalle si cuentaId no viene en el query', async () => {
      await service.consultarLibroMayor(TENANT_ID, baseQuery);

      expect(mayorReader.obtenerCuentaDetalle).not.toHaveBeenCalled();
    });

    it('procede sin error si obtenerCuentaDetalle devuelve esDetalle=true', async () => {
      mayorReader.obtenerCuentaDetalle.mockResolvedValue({ id: 'cuenta-1', esDetalle: true });

      await expect(
        service.consultarLibroMayor(TENANT_ID, { ...baseQuery, cuentaId: 'cuenta-1' }),
      ).resolves.toBeDefined();
    });
  });

  // ============================================================
  // Tope defensivo (REQ-LM-12)
  // ============================================================

  describe('tope defensivo', () => {
    const baseQuery = {
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-31',
      incluirAnulados: false,
      soloConMovimiento: true,
    };

    it(`lanza MovimientosExcedenLimiteError si el count supera el límite (${LIMIT_TEST})`, async () => {
      mayorReader.contarMovimientos.mockResolvedValue(LIMIT_TEST + 1);

      await expect(service.consultarLibroMayor(TENANT_ID, baseQuery)).rejects.toThrow(
        MovimientosExcedenLimiteError,
      );

      // No debe llamar a obtenerMovimientos si hay tope
      expect(mayorReader.obtenerMovimientos).not.toHaveBeenCalled();
    });

    it('no lanza si el count es exactamente el límite', async () => {
      mayorReader.contarMovimientos.mockResolvedValue(LIMIT_TEST);

      await expect(service.consultarLibroMayor(TENANT_ID, baseQuery)).resolves.toBeDefined();
    });
  });

  // ============================================================
  // Saldo inicial por naturaleza (REQ-LM-04)
  // ============================================================

  describe('saldo inicial por naturaleza', () => {
    const baseQuery = {
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-31',
      incluirAnulados: false,
      soloConMovimiento: false, // para que aparezca cuenta con saldo pero sin movimiento
    };

    it('DEUDORA: saldoInicial = totalDebitoBob − totalCreditoBob (resultado positivo)', async () => {
      const saldoRow = makeSaldoInicialRow({
        totalDebitoBob: new Decimal('700.00'),
        totalCreditoBob: new Decimal('0.00'),
        naturaleza: NaturalezaCuenta.DEUDORA,
      });
      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);
      mayorReader.obtenerMovimientos.mockResolvedValue([]);

      const result = await service.consultarLibroMayor(TENANT_ID, baseQuery);

      expect(result.cuentas).toHaveLength(1);
      expect(result.cuentas[0]!.saldoInicialBob).toBe('700.00');
    });

    it('ACREEDORA: saldoInicial = totalCreditoBob − totalDebitoBob (resultado positivo)', async () => {
      const saldoRow = makeSaldoInicialRow({
        cuentaId: 'cuenta-ventas',
        naturaleza: NaturalezaCuenta.ACREEDORA,
        totalDebitoBob: new Decimal('0.00'),
        totalCreditoBob: new Decimal('600.00'),
      });
      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);
      mayorReader.obtenerMovimientos.mockResolvedValue([]);

      const result = await service.consultarLibroMayor(TENANT_ID, baseQuery);

      expect(result.cuentas[0]!.saldoInicialBob).toBe('600.00');
    });

    it('saldo inicial negativo válido (DEUDORA con más créditos que débitos)', async () => {
      const saldoRow = makeSaldoInicialRow({
        naturaleza: NaturalezaCuenta.DEUDORA,
        totalDebitoBob: new Decimal('100.00'),
        totalCreditoBob: new Decimal('400.00'),
      });
      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);
      mayorReader.obtenerMovimientos.mockResolvedValue([]);

      const result = await service.consultarLibroMayor(TENANT_ID, baseQuery);

      expect(result.cuentas[0]!.saldoInicialBob).toBe('-300.00');
    });

    it('sin historial previo: saldoInicialBob === "0.00"', async () => {
      const movRow = makeMovimientoRow();
      mayorReader.obtenerMovimientos.mockResolvedValue([movRow]);
      mayorReader.contarMovimientos.mockResolvedValue(1);
      // obtenerSaldosIniciales devuelve vacío → sin historial

      const result = await service.consultarLibroMayor(TENANT_ID, {
        ...baseQuery,
        soloConMovimiento: true,
      });

      expect(result.cuentas[0]!.saldoInicialBob).toBe('0.00');
    });
  });

  // ============================================================
  // Running balance (REQ-LM-05)
  // ============================================================

  describe('running balance', () => {
    const baseQuery = {
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-31',
      incluirAnulados: false,
      soloConMovimiento: true,
    };

    it('DEUDORA con saldoInicial 500: 3 movimientos → saldoCorriente acumulado correcto', async () => {
      // DEUDORA: saldo += debe − haber
      // 500 + 200 = 700, 700 - 100 = 600, 600 + 50 = 650
      const saldoRow = makeSaldoInicialRow({
        naturaleza: NaturalezaCuenta.DEUDORA,
        totalDebitoBob: new Decimal('500.00'),
        totalCreditoBob: new Decimal('0.00'),
      });
      const movimientos = [
        makeMovimientoRow({ debitoBob: new Decimal('200.00'), creditoBob: new Decimal('0.00') }),
        makeMovimientoRow({
          comprobanteId: 'comp-2',
          debitoBob: new Decimal('0.00'),
          creditoBob: new Decimal('100.00'),
        }),
        makeMovimientoRow({
          comprobanteId: 'comp-3',
          debitoBob: new Decimal('50.00'),
          creditoBob: new Decimal('0.00'),
        }),
      ];

      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);
      mayorReader.obtenerMovimientos.mockResolvedValue(movimientos);
      mayorReader.contarMovimientos.mockResolvedValue(3);

      const result = await service.consultarLibroMayor(TENANT_ID, baseQuery);

      const cuenta = result.cuentas[0]!;
      expect(cuenta.movimientos).toHaveLength(3);
      expect(cuenta.movimientos[0]!.saldoCorrienteBob).toBe('700.00');
      expect(cuenta.movimientos[1]!.saldoCorrienteBob).toBe('600.00');
      expect(cuenta.movimientos[2]!.saldoCorrienteBob).toBe('650.00');
    });

    it('ACREEDORA con saldoInicial 1000: 2 movimientos → saldoCorriente correcto', async () => {
      // ACREEDORA: saldo += haber − debe
      // 1000 + 500 = 1500, 1500 - 200 = 1300
      const saldoRow = makeSaldoInicialRow({
        cuentaId: 'cuenta-ventas',
        naturaleza: NaturalezaCuenta.ACREEDORA,
        totalDebitoBob: new Decimal('0.00'),
        totalCreditoBob: new Decimal('1000.00'),
      });
      const movimientos = [
        makeMovimientoRow({
          cuentaId: 'cuenta-ventas',
          naturaleza: NaturalezaCuenta.ACREEDORA,
          debitoBob: new Decimal('0.00'),
          creditoBob: new Decimal('500.00'),
        }),
        makeMovimientoRow({
          cuentaId: 'cuenta-ventas',
          comprobanteId: 'comp-2',
          naturaleza: NaturalezaCuenta.ACREEDORA,
          debitoBob: new Decimal('200.00'),
          creditoBob: new Decimal('0.00'),
        }),
      ];

      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);
      mayorReader.obtenerMovimientos.mockResolvedValue(movimientos);
      mayorReader.contarMovimientos.mockResolvedValue(2);

      const result = await service.consultarLibroMayor(TENANT_ID, baseQuery);

      const cuenta = result.cuentas[0]!;
      expect(cuenta.movimientos[0]!.saldoCorrienteBob).toBe('1500.00');
      expect(cuenta.movimientos[1]!.saldoCorrienteBob).toBe('1300.00');
    });
  });

  // ============================================================
  // Saldo final (REQ-LM-06)
  // ============================================================

  describe('saldo final', () => {
    const baseQuery = {
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-31',
      incluirAnulados: false,
      soloConMovimiento: true,
    };

    it('saldoFinalBob coincide con saldoCorriente del último movimiento', async () => {
      const saldoRow = makeSaldoInicialRow({
        naturaleza: NaturalezaCuenta.DEUDORA,
        totalDebitoBob: new Decimal('500.00'),
        totalCreditoBob: new Decimal('0.00'),
      });
      const movimientos = [
        makeMovimientoRow({ debitoBob: new Decimal('200.00'), creditoBob: new Decimal('0.00') }),
        makeMovimientoRow({
          comprobanteId: 'comp-2',
          debitoBob: new Decimal('0.00'),
          creditoBob: new Decimal('100.00'),
        }),
      ];

      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);
      mayorReader.obtenerMovimientos.mockResolvedValue(movimientos);
      mayorReader.contarMovimientos.mockResolvedValue(2);

      const result = await service.consultarLibroMayor(TENANT_ID, baseQuery);

      const cuenta = result.cuentas[0]!;
      const ultimoMov = cuenta.movimientos[cuenta.movimientos.length - 1]!;
      expect(cuenta.saldoFinalBob).toBe(ultimoMov.saldoCorrienteBob);
      // 500 + 200 = 700, 700 - 100 = 600
      expect(cuenta.saldoFinalBob).toBe('600.00');
    });

    it('sin movimientos en el rango: saldoFinalBob === saldoInicialBob, movimientos: []', async () => {
      const saldoRow = makeSaldoInicialRow({
        naturaleza: NaturalezaCuenta.DEUDORA,
        totalDebitoBob: new Decimal('300.00'),
        totalCreditoBob: new Decimal('0.00'),
      });
      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);

      const result = await service.consultarLibroMayor(TENANT_ID, {
        ...baseQuery,
        soloConMovimiento: false,
      });

      const cuenta = result.cuentas[0]!;
      expect(cuenta.movimientos).toHaveLength(0);
      expect(cuenta.saldoInicialBob).toBe('300.00');
      expect(cuenta.saldoFinalBob).toBe('300.00');
    });
  });

  // ============================================================
  // soloConMovimiento (REQ-LM-08)
  // ============================================================

  describe('soloConMovimiento', () => {
    it('soloConMovimiento=true: cuenta con saldoInicial pero sin movimientos es excluida', async () => {
      const saldoRow = makeSaldoInicialRow({
        totalDebitoBob: new Decimal('500.00'),
        totalCreditoBob: new Decimal('0.00'),
      });
      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);
      // obtenerMovimientos devuelve vacío (default)

      const result = await service.consultarLibroMayor(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
        soloConMovimiento: true,
      });

      expect(result.cuentas).toHaveLength(0);
    });

    it('soloConMovimiento=false: cuenta con saldoInicial != 0 y sin movimientos es incluida', async () => {
      const saldoRow = makeSaldoInicialRow({
        totalDebitoBob: new Decimal('500.00'),
        totalCreditoBob: new Decimal('0.00'),
      });
      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);

      const result = await service.consultarLibroMayor(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
        soloConMovimiento: false,
      });

      expect(result.cuentas).toHaveLength(1);
      expect(result.cuentas[0]!.movimientos).toHaveLength(0);
    });

    it('soloConMovimiento=false: cuenta con saldoInicial === 0 y sin movimientos es excluida', async () => {
      const saldoRow = makeSaldoInicialRow({
        totalDebitoBob: new Decimal('0.00'),
        totalCreditoBob: new Decimal('0.00'),
      });
      mayorReader.obtenerSaldosIniciales.mockResolvedValue([saldoRow]);

      const result = await service.consultarLibroMayor(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
        soloConMovimiento: false,
      });

      expect(result.cuentas).toHaveLength(0);
    });
  });

  // ============================================================
  // Sin cuentaId (todas las cuentas) (REQ-LM-08)
  // ============================================================

  describe('sin cuentaId (todas las cuentas)', () => {
    it('no llama a obtenerCuentaDetalle cuando no hay cuentaId', async () => {
      await service.consultarLibroMayor(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
        soloConMovimiento: true,
      });

      expect(mayorReader.obtenerCuentaDetalle).not.toHaveBeenCalled();
    });

    it('responde con cuentas vacías cuando no hay movimientos ni saldos previos (no error)', async () => {
      const result = await service.consultarLibroMayor(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
        soloConMovimiento: true,
      });

      expect(result.cuentas).toHaveLength(0);
      expect(result.totalDebeBob).toBe('0.00');
      expect(result.totalHaberBob).toBe('0.00');
    });

    it('agrupa movimientos de múltiples cuentas correctamente', async () => {
      const movCaja = makeMovimientoRow({
        cuentaId: 'cuenta-caja',
        codigoInterno: '1.1.1.001',
        naturaleza: NaturalezaCuenta.DEUDORA,
        debitoBob: new Decimal('1000.00'),
        creditoBob: new Decimal('0.00'),
      });
      const movVentas = makeMovimientoRow({
        cuentaId: 'cuenta-ventas',
        codigoInterno: '4.1.1.001',
        naturaleza: NaturalezaCuenta.ACREEDORA,
        debitoBob: new Decimal('0.00'),
        creditoBob: new Decimal('1000.00'),
      });

      mayorReader.obtenerMovimientos.mockResolvedValue([movCaja, movVentas]);
      mayorReader.contarMovimientos.mockResolvedValue(2);

      const result = await service.consultarLibroMayor(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
        soloConMovimiento: true,
      });

      expect(result.cuentas).toHaveLength(2);
      // Ordenado por codigoInterno ASC: 1.1.1.001 antes de 4.1.1.001
      expect(result.cuentas[0]!.codigoInterno).toBe('1.1.1.001');
      expect(result.cuentas[1]!.codigoInterno).toBe('4.1.1.001');
    });
  });
});
