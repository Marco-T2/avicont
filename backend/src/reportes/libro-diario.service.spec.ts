import { EstadoComprobante, TipoComprobante } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ConfigService } from '@nestjs/config';

import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';
import type { CuentasReaderLookupPort } from '@/cuentas/ports/cuentas-reader-lookup.port';

import {
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  FiltroRequeridoError,
  PeriodoNoEncontradoError,
  RangoExcedeLimiteError,
  RangoInvalidoError,
} from './domain/libro-diario-errors';
import { LibroDiarioService, LIBRO_DIARIO_MAX_ASIENTOS_DEFAULT } from './libro-diario.service';
import type { ComprobantesReaderPort } from './ports/comprobantes-reader.port';

// ============================================================
// Mocks tipados (nunca se mockea Prisma directamente — §7.8 CLAUDE.md)
// ============================================================

type MockComprobantesReader = {
  [K in keyof ComprobantesReaderPort]: jest.Mock;
};
type MockPeriodosReader = {
  [K in keyof Pick<PeriodosReaderPort, 'obtenerRangoFechas'>]: jest.Mock;
};
type MockCuentasReaderLookup = jest.Mocked<CuentasReaderLookupPort>;

function makeComprobantesReaderMock(): MockComprobantesReader {
  return {
    contarAsientos: jest.fn(),
    obtenerAsientosParaLibroDiario: jest.fn(),
  };
}

function makePeriodosReaderMock(): MockPeriodosReader {
  return {
    obtenerRangoFechas: jest.fn(),
  };
}

function makeCuentasReaderLookupMock(): MockCuentasReaderLookup {
  return {
    obtenerCuentaDetalle: jest.fn(),
  } as unknown as MockCuentasReaderLookup;
}

function makeCuentaDetalle(overrides: Partial<{ id: string; esDetalle: boolean }> = {}) {
  return { id: 'cuenta-detalle-1', esDetalle: true, ...overrides };
}

// ============================================================
// Fixture: asiento con dos líneas balanceadas
// ============================================================

function makeRowAsiento(overrides = {}) {
  return {
    id: 'comp-1',
    organizationId: 'org-1',
    tipo: TipoComprobante.DIARIO,
    numero: 'D2601-000001',
    estado: EstadoComprobante.CONTABILIZADO,
    fechaContable: new Date('2026-01-10T00:00:00Z'),
    glosa: 'Venta',
    anulado: false,
    lineas: [
      {
        orden: 1,
        glosaLinea: null,
        debitoBob: new Decimal('1000.00'),
        creditoBob: new Decimal('0.00'),
        cuenta: { codigoInterno: '1.1.1.001', nombre: 'Caja MN' },
      },
      {
        orden: 2,
        glosaLinea: null,
        debitoBob: new Decimal('0.00'),
        creditoBob: new Decimal('1000.00'),
        cuenta: { codigoInterno: '4.1.1.001', nombre: 'Ventas' },
      },
    ],
    ...overrides,
  };
}

const TENANT_ID = 'org-test-1';

// ============================================================
// Tests
// ============================================================

/** Crea un ConfigService stub que devuelve el límite indicado para LIBRO_DIARIO_MAX_ASIENTOS. */
function makeConfigService(maxAsientos: number = LIBRO_DIARIO_MAX_ASIENTOS_DEFAULT): ConfigService {
  return {
    get: (_key: string, defaultVal?: number) => {
      // Retorna el límite para la key esperada; para cualquier otra key usa el default.
      if (_key === 'LIBRO_DIARIO_MAX_ASIENTOS') return maxAsientos;
      return defaultVal;
    },
  } as unknown as ConfigService;
}

describe('LibroDiarioService (unit)', () => {
  let service: LibroDiarioService;
  let comprobantesReader: MockComprobantesReader;
  let periodosReader: MockPeriodosReader;
  let cuentasReaderLookup: MockCuentasReaderLookup;

  beforeEach(() => {
    comprobantesReader = makeComprobantesReaderMock();
    periodosReader = makePeriodosReaderMock();
    cuentasReaderLookup = makeCuentasReaderLookupMock();
    service = new LibroDiarioService(
      comprobantesReader as unknown as ComprobantesReaderPort,
      periodosReader as unknown as PeriodosReaderPort,
      cuentasReaderLookup as unknown as CuentasReaderLookupPort,
      makeConfigService(),
    );
  });

  // ============================================================
  // Validación de filtros (REQ-LD-01)
  // ============================================================

  describe('validación de filtros', () => {
    it('lanza FiltroRequeridoError si no se recibe ningún filtro', async () => {
      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          incluirAnulados: false,
        }),
      ).rejects.toThrow(FiltroRequeridoError);
    });

    it('lanza FiltroRequeridoError si se reciben ambos tipos de filtro simultáneamente', async () => {
      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          periodoFiscalId: 'periodo-uuid',
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
          incluirAnulados: false,
        }),
      ).rejects.toThrow(FiltroRequeridoError);
    });

    it('lanza FiltroRequeridoError si se recibe fechaDesde sin fechaHasta', async () => {
      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          fechaDesde: '2026-01-01',
          incluirAnulados: false,
        }),
      ).rejects.toThrow(FiltroRequeridoError);
    });

    it('lanza FiltroRequeridoError si se recibe fechaHasta sin fechaDesde', async () => {
      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          fechaHasta: '2026-01-31',
          incluirAnulados: false,
        }),
      ).rejects.toThrow(FiltroRequeridoError);
    });

    it('lanza RangoInvalidoError si fechaDesde > fechaHasta', async () => {
      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          fechaDesde: '2026-01-31',
          fechaHasta: '2026-01-01',
          incluirAnulados: false,
        }),
      ).rejects.toThrow(RangoInvalidoError);
    });
  });

  // ============================================================
  // Resolución de período (REQ-LD-01 + decisión #4)
  // ============================================================

  describe('resolución de período', () => {
    it('lanza PeriodoNoEncontradoError si el período no existe o no pertenece al tenant', async () => {
      periodosReader.obtenerRangoFechas.mockResolvedValue(null);

      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          periodoFiscalId: 'periodo-inexistente',
          incluirAnulados: false,
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
      comprobantesReader.contarAsientos.mockResolvedValue(1);
      comprobantesReader.obtenerAsientosParaLibroDiario.mockResolvedValue([makeRowAsiento()]);

      await service.consultarLibroDiario(TENANT_ID, {
        periodoFiscalId: 'periodo-enero',
        incluirAnulados: false,
      });

      expect(comprobantesReader.contarAsientos).toHaveBeenCalledWith(TENANT_ID, {
        fechaDesde: rango.desde,
        fechaHasta: rango.hasta,
        incluirAnulados: false,
      });
    });
  });

  // ============================================================
  // Tope defensivo (REQ-LD-10)
  // ============================================================

  describe('tope defensivo', () => {
    it('lanza RangoExcedeLimiteError si el count supera el límite (5000)', async () => {
      comprobantesReader.contarAsientos.mockResolvedValue(5001);

      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-12-31',
          incluirAnulados: false,
        }),
      ).rejects.toThrow(RangoExcedeLimiteError);

      // No debe llamar a obtenerAsientosParaLibroDiario si hay tope
      expect(comprobantesReader.obtenerAsientosParaLibroDiario).not.toHaveBeenCalled();
    });

    it('no lanza si el count es exactamente el límite (5000)', async () => {
      comprobantesReader.contarAsientos.mockResolvedValue(5000);
      comprobantesReader.obtenerAsientosParaLibroDiario.mockResolvedValue([]);

      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-12-31',
          incluirAnulados: false,
        }),
      ).resolves.toBeDefined();
    });
  });

  // ============================================================
  // Validación de cuenta (REQ-LD-12..16)
  // ============================================================

  describe('validación de cuenta (REQ-LD-12..16)', () => {
    it('sin cuentaId → obtenerCuentaDetalle NO es llamado, filtros sin cuentaId', async () => {
      comprobantesReader.contarAsientos.mockResolvedValue(1);
      comprobantesReader.obtenerAsientosParaLibroDiario.mockResolvedValue([makeRowAsiento()]);

      await service.consultarLibroDiario(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
      });

      expect(cuentasReaderLookup.obtenerCuentaDetalle).not.toHaveBeenCalled();
      expect(comprobantesReader.contarAsientos).toHaveBeenCalledWith(
        TENANT_ID,
        expect.not.objectContaining({ cuentaId: expect.anything() }),
      );
    });

    it('cuentaId + cuenta inexistente (lookup null) → CuentaNoEncontradaError, contarAsientos NO llamado', async () => {
      cuentasReaderLookup.obtenerCuentaDetalle.mockResolvedValue(null);

      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
          incluirAnulados: false,
          cuentaId: 'cuenta-inexistente-uuid',
        }),
      ).rejects.toThrow(CuentaNoEncontradaError);

      expect(comprobantesReader.contarAsientos).not.toHaveBeenCalled();
    });

    it('cuentaId + cuenta agrupadora (esDetalle=false) → CuentaNoDetalleError, contarAsientos NO llamado', async () => {
      cuentasReaderLookup.obtenerCuentaDetalle.mockResolvedValue(
        makeCuentaDetalle({ esDetalle: false }),
      );

      await expect(
        service.consultarLibroDiario(TENANT_ID, {
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
          incluirAnulados: false,
          cuentaId: 'cuenta-agrupadora-uuid',
        }),
      ).rejects.toThrow(CuentaNoDetalleError);

      expect(comprobantesReader.contarAsientos).not.toHaveBeenCalled();
    });

    it('cuentaId + cuenta de detalle válida → contarAsientos con filtros que incluyen cuentaId', async () => {
      const cuentaId = 'cuenta-detalle-uuid';
      cuentasReaderLookup.obtenerCuentaDetalle.mockResolvedValue(
        makeCuentaDetalle({ id: cuentaId, esDetalle: true }),
      );
      comprobantesReader.contarAsientos.mockResolvedValue(1);
      comprobantesReader.obtenerAsientosParaLibroDiario.mockResolvedValue([makeRowAsiento()]);

      await service.consultarLibroDiario(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
        cuentaId,
      });

      expect(cuentasReaderLookup.obtenerCuentaDetalle).toHaveBeenCalledWith(TENANT_ID, cuentaId);
      expect(comprobantesReader.contarAsientos).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ cuentaId }),
      );
      expect(comprobantesReader.obtenerAsientosParaLibroDiario).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ cuentaId }),
      );
    });

    it('tope defensivo con cuentaId: cuenta filtrada supera tope → RangoExcedeLimiteError (REQ-LD-16)', async () => {
      const cuentaId = 'cuenta-detalle-uuid';
      const serviceConTope = new LibroDiarioService(
        comprobantesReader as unknown as ComprobantesReaderPort,
        periodosReader as unknown as PeriodosReaderPort,
        cuentasReaderLookup as unknown as CuentasReaderLookupPort,
        makeConfigService(2),
      );

      cuentasReaderLookup.obtenerCuentaDetalle.mockResolvedValue(
        makeCuentaDetalle({ id: cuentaId }),
      );
      comprobantesReader.contarAsientos.mockResolvedValue(3); // supera tope de 2

      await expect(
        serviceConTope.consultarLibroDiario(TENANT_ID, {
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
          incluirAnulados: false,
          cuentaId,
        }),
      ).rejects.toThrow(RangoExcedeLimiteError);
    });

    it('tope defensivo con cuentaId: cuenta filtrada por debajo del tope → 200 (REQ-LD-16)', async () => {
      const cuentaId = 'cuenta-detalle-uuid';
      const serviceConTope = new LibroDiarioService(
        comprobantesReader as unknown as ComprobantesReaderPort,
        periodosReader as unknown as PeriodosReaderPort,
        cuentasReaderLookup as unknown as CuentasReaderLookupPort,
        makeConfigService(5),
      );

      cuentasReaderLookup.obtenerCuentaDetalle.mockResolvedValue(
        makeCuentaDetalle({ id: cuentaId }),
      );
      comprobantesReader.contarAsientos.mockResolvedValue(3); // bajo tope de 5
      comprobantesReader.obtenerAsientosParaLibroDiario.mockResolvedValue([makeRowAsiento()]);

      await expect(
        serviceConTope.consultarLibroDiario(TENANT_ID, {
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
          incluirAnulados: false,
          cuentaId,
        }),
      ).resolves.toBeDefined();
    });
  });

  // ============================================================
  // Happy path: mapeo correcto al DTO
  // ============================================================

  describe('happy path', () => {
    beforeEach(() => {
      comprobantesReader.contarAsientos.mockResolvedValue(1);
      comprobantesReader.obtenerAsientosParaLibroDiario.mockResolvedValue([makeRowAsiento()]);
    });

    it('devuelve LibroDiarioResponseDto con asientos, totales y rango', async () => {
      const result = await service.consultarLibroDiario(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: false,
      });

      expect(result.asientos).toHaveLength(1);
      expect(result.totalDebeBob).toBe('1000.00');
      expect(result.totalHaberBob).toBe('1000.00');
      expect(result.rango.fechaDesde).toBe('2026-01-01');
      expect(result.rango.fechaHasta).toBe('2026-01-31');
    });

    it('pasa incluirAnulados=true al adapter', async () => {
      comprobantesReader.contarAsientos.mockResolvedValue(2);
      comprobantesReader.obtenerAsientosParaLibroDiario.mockResolvedValue([
        makeRowAsiento(),
        makeRowAsiento({ id: 'comp-2', anulado: true }),
      ]);

      const result = await service.consultarLibroDiario(TENANT_ID, {
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        incluirAnulados: true,
      });

      expect(comprobantesReader.obtenerAsientosParaLibroDiario).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ incluirAnulados: true }),
      );
      expect(result.asientos).toHaveLength(2);
    });

    it('devuelve totalDebeBob y totalHaberBob "0.00" para período sin asientos', async () => {
      comprobantesReader.contarAsientos.mockResolvedValue(0);
      comprobantesReader.obtenerAsientosParaLibroDiario.mockResolvedValue([]);

      const result = await service.consultarLibroDiario(TENANT_ID, {
        fechaDesde: '2026-02-01',
        fechaHasta: '2026-02-28',
        incluirAnulados: false,
      });

      expect(result.asientos).toHaveLength(0);
      expect(result.totalDebeBob).toBe('0.00');
      expect(result.totalHaberBob).toBe('0.00');
    });
  });
});
