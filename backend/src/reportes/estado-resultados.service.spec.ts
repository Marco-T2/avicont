import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import {
  GestionNoEncontradaError,
  PeriodoNoEncontradoError,
  RangoInvalidoError,
} from './domain/resultados-errors';
import { EstadoResultadosService } from './estado-resultados.service';
import type { EeffSaldosReaderPort } from './ports/eeff-saldos-reader.port';

// ============================================================
// Mocks tipados (§7.8 CLAUDE.md — nunca se mockea Prisma directamente)
// ============================================================

type MockEeffSaldosReader = {
  [K in keyof EeffSaldosReaderPort]: jest.Mock;
};

type MockPeriodosReader = {
  obtenerRangoFechas: jest.Mock;
  obtenerRangoGestion: jest.Mock;
};

function makeEeffSaldosReaderMock(): MockEeffSaldosReader {
  return {
    obtenerSaldosHasta: jest.fn(),
    obtenerSaldosEnRango: jest.fn(),
    obtenerEstructuraCuentas: jest.fn(),
  };
}

function makePeriodosReaderMock(): MockPeriodosReader {
  return {
    obtenerRangoFechas: jest.fn(),
    obtenerRangoGestion: jest.fn(),
  };
}

// ============================================================
// Fixtures
// ============================================================

const TENANT_ID = 'org-test-1';
const PERIODO_ID = 'periodo-uuid-1';
const GESTION_ID = 'gestion-uuid-1';
const DESDE = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
const HASTA = new Date(Date.UTC(2026, 4, 31)); // 2026-05-31

// ============================================================
// Tests
// ============================================================

describe('EstadoResultadosService (unit)', () => {
  let service: EstadoResultadosService;
  let eeffReader: MockEeffSaldosReader;
  let periodosReader: MockPeriodosReader;

  beforeEach(() => {
    eeffReader = makeEeffSaldosReaderMock();
    periodosReader = makePeriodosReaderMock();
    service = new EstadoResultadosService(
      eeffReader as unknown as EeffSaldosReaderPort,
      periodosReader as unknown as PeriodosReaderPort,
    );

    // Happy path defaults
    periodosReader.obtenerRangoFechas.mockResolvedValue({ desde: DESDE, hasta: HASTA });
    periodosReader.obtenerRangoGestion.mockResolvedValue({ desde: DESDE, hasta: HASTA });
    eeffReader.obtenerSaldosEnRango.mockResolvedValue([]);
    eeffReader.obtenerEstructuraCuentas.mockResolvedValue([]);
  });

  // ============================================================
  // Resolución de rango — REQ-ER-01
  // ============================================================

  describe('resolución de rango', () => {
    it('sin ninguna forma → RangoInvalidoError (400, REPORTES_RESULTADOS_RANGO_INVALIDO)', async () => {
      await expect(service.consultarEstadoResultados(TENANT_ID, {})).rejects.toThrow(
        RangoInvalidoError,
      );
    });

    it('fechaDesde sin fechaHasta → RangoInvalidoError', async () => {
      await expect(
        service.consultarEstadoResultados(TENANT_ID, { fechaDesde: '2026-05-01' }),
      ).rejects.toThrow(RangoInvalidoError);
    });

    it('fechaHasta sin fechaDesde → RangoInvalidoError', async () => {
      await expect(
        service.consultarEstadoResultados(TENANT_ID, { fechaHasta: '2026-05-31' }),
      ).rejects.toThrow(RangoInvalidoError);
    });

    it('fechaDesde > fechaHasta → RangoInvalidoError', async () => {
      await expect(
        service.consultarEstadoResultados(TENANT_ID, {
          fechaDesde: '2026-06-01',
          fechaHasta: '2026-05-01',
        }),
      ).rejects.toThrow(RangoInvalidoError);
    });

    it('fechaDesde con formato inválido → RangoInvalidoError', async () => {
      await expect(
        service.consultarEstadoResultados(TENANT_ID, {
          fechaDesde: '31-05-2026',
          fechaHasta: '2026-05-31',
        }),
      ).rejects.toThrow(RangoInvalidoError);
    });

    it('rango directo válido → llama obtenerSaldosEnRango (NUNCA obtenerSaldosHasta)', async () => {
      await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
      });

      expect(eeffReader.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Date),
        expect.any(Date),
        false,
      );
      // NUNCA debe llamar obtenerSaldosHasta — garantía de flujo (REQ-ER-02)
      expect(eeffReader.obtenerSaldosHasta).not.toHaveBeenCalled();
    });

    it('periodoFiscalId → llama obtenerRangoFechas; null → PeriodoNoEncontradoError (422)', async () => {
      periodosReader.obtenerRangoFechas.mockResolvedValue(null);

      await expect(
        service.consultarEstadoResultados(TENANT_ID, { periodoFiscalId: PERIODO_ID }),
      ).rejects.toThrow(PeriodoNoEncontradoError);
    });

    it('periodoFiscalId válido → llama obtenerRangoFechas con el ID correcto', async () => {
      await service.consultarEstadoResultados(TENANT_ID, { periodoFiscalId: PERIODO_ID });

      expect(periodosReader.obtenerRangoFechas).toHaveBeenCalledWith(TENANT_ID, PERIODO_ID);
    });

    it('gestionId → llama obtenerRangoGestion; null → GestionNoEncontradaError (422)', async () => {
      periodosReader.obtenerRangoGestion.mockResolvedValue(null);

      await expect(
        service.consultarEstadoResultados(TENANT_ID, { gestionId: GESTION_ID }),
      ).rejects.toThrow(GestionNoEncontradaError);
    });

    it('gestionId válido → llama obtenerRangoGestion con el ID correcto', async () => {
      await service.consultarEstadoResultados(TENANT_ID, { gestionId: GESTION_ID });

      expect(periodosReader.obtenerRangoGestion).toHaveBeenCalledWith(TENANT_ID, GESTION_ID);
    });

    it('prioridad: fechas directas > periodoFiscalId — usa fechas, no llama obtenerRangoFechas', async () => {
      await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
        periodoFiscalId: PERIODO_ID,
      });

      expect(periodosReader.obtenerRangoFechas).not.toHaveBeenCalled();
      expect(eeffReader.obtenerSaldosEnRango).toHaveBeenCalled();
    });

    it('prioridad: periodoFiscalId > gestionId — usa periodo, no llama obtenerRangoGestion', async () => {
      await service.consultarEstadoResultados(TENANT_ID, {
        periodoFiscalId: PERIODO_ID,
        gestionId: GESTION_ID,
      });

      expect(periodosReader.obtenerRangoFechas).toHaveBeenCalled();
      expect(periodosReader.obtenerRangoGestion).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Garantía de FLUJO — REQ-ER-02 (CRÍTICO)
  // ============================================================

  describe('garantía de FLUJO (REQ-ER-02)', () => {
    it('NUNCA llama obtenerSaldosHasta — solo obtenerSaldosEnRango', async () => {
      await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
      });

      expect(eeffReader.obtenerSaldosHasta).not.toHaveBeenCalled();
      expect(eeffReader.obtenerSaldosEnRango).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // Toggle incluirAnulados — REQ-ER-04
  // ============================================================

  describe('toggle incluirAnulados (REQ-ER-04)', () => {
    it('incluirAnulados=false (default) propagado a obtenerSaldosEnRango', async () => {
      await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
      });

      expect(eeffReader.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Date),
        expect.any(Date),
        false,
      );
    });

    it('incluirAnulados=true propagado a obtenerSaldosEnRango', async () => {
      await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
        incluirAnulados: true,
      });

      expect(eeffReader.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Date),
        expect.any(Date),
        true,
      );
    });

    it('Promise.all: obtenerSaldosEnRango + obtenerEstructuraCuentas corren en paralelo', async () => {
      let saldosOrder: number | undefined;
      let estructuraOrder: number | undefined;
      let callCount = 0;

      eeffReader.obtenerSaldosEnRango.mockImplementation(async () => {
        saldosOrder = ++callCount;
        return [];
      });
      eeffReader.obtenerEstructuraCuentas.mockImplementation(async () => {
        estructuraOrder = ++callCount;
        return [];
      });

      await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
      });

      expect(saldosOrder).toBeDefined();
      expect(estructuraOrder).toBeDefined();
    });
  });

  // ============================================================
  // Orquestación
  // ============================================================

  describe('orquestación', () => {
    it('tenant sin comprobantes → respuesta 200 con totales "0.00"', async () => {
      const result = await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
      });

      expect(result.totalIngresoBob).toBe('0.00');
      expect(result.totalEgresoBob).toBe('0.00');
      expect(result.resultadoEjercicioBob).toBe('0.00');
    });

    it('fechaDesde y fechaHasta en la respuesta', async () => {
      const result = await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
      });

      expect(result.fechaDesde).toBe('2026-05-01');
      expect(result.fechaHasta).toBe('2026-05-31');
    });

    it('tiene secciones ingreso y egreso en la respuesta', async () => {
      const result = await service.consultarEstadoResultados(TENANT_ID, {
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-31',
      });

      expect(result.ingreso).toBeDefined();
      expect(result.egreso).toBeDefined();
      expect(result.ingreso.claseCuenta).toBe('INGRESO');
      expect(result.egreso.claseCuenta).toBe('EGRESO');
    });
  });
});
