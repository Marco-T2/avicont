import { Decimal } from '@prisma/client/runtime/library';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import {
  GestionNoEncontradaError,
  PeriodoNoEncontradoError,
  RangoInvalidoError,
} from './domain/evolucion-patrimonio-errors';
import { EvolucionPatrimonioService } from './evolucion-patrimonio.service';
import type { EeffSaldosReaderPort, SaldoCuentaRow } from './ports/eeff-saldos-reader.port';

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
    obtenerSaldosEnRangoSeparandoAjustes: jest.fn(),
  };
}

function makePeriodosReaderMock(): MockPeriodosReader {
  return {
    obtenerRangoFechas: jest.fn(),
    obtenerRangoGestion: jest.fn(),
  };
}

function saldo(cuentaId: string, debe: string, haber: string): SaldoCuentaRow {
  return {
    cuentaId,
    totalDebitoBob: new Decimal(debe),
    totalCreditoBob: new Decimal(haber),
  };
}

// ============================================================
// Fixtures
// ============================================================

const TENANT_ID = 'org-test-1';
const PERIODO_ID = '11111111-1111-4111-8111-111111111111';
const GESTION_ID = '22222222-2222-4222-8222-222222222222';
const DESDE = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01
const HASTA = new Date(Date.UTC(2026, 11, 31)); // 2026-12-31

const CAPITAL = {
  id: 'cap',
  parentId: null,
  nivel: 1,
  esDetalle: true,
  esContraria: false,
  claseCuenta: ClaseCuenta.PATRIMONIO,
  subClaseCuenta: SubClaseCuenta.PATRIMONIO_CAPITAL,
  naturaleza: NaturalezaCuenta.ACREEDORA,
  codigoInterno: '3.1.1.001',
  nombre: 'Capital Social',
};

// ============================================================
// Tests
// ============================================================

describe('EvolucionPatrimonioService (unit)', () => {
  let service: EvolucionPatrimonioService;
  let eeffReader: MockEeffSaldosReader;
  let periodosReader: MockPeriodosReader;

  beforeEach(() => {
    eeffReader = makeEeffSaldosReaderMock();
    periodosReader = makePeriodosReaderMock();
    service = new EvolucionPatrimonioService(
      eeffReader as unknown as EeffSaldosReaderPort,
      periodosReader as unknown as PeriodosReaderPort,
    );

    periodosReader.obtenerRangoFechas.mockResolvedValue({ desde: DESDE, hasta: HASTA });
    periodosReader.obtenerRangoGestion.mockResolvedValue({ desde: DESDE, hasta: HASTA });
    eeffReader.obtenerSaldosHasta.mockResolvedValue([]);
    eeffReader.obtenerSaldosEnRango.mockResolvedValue([]);
    eeffReader.obtenerEstructuraCuentas.mockResolvedValue([]);
  });

  describe('resolución de rango', () => {
    it('sin ninguna forma → RangoInvalidoError', async () => {
      await expect(service.consultarEvolucionPatrimonio(TENANT_ID, {})).rejects.toThrow(
        RangoInvalidoError,
      );
    });

    it('fechaDesde sin fechaHasta → RangoInvalidoError', async () => {
      await expect(
        service.consultarEvolucionPatrimonio(TENANT_ID, { fechaDesde: '2026-01-01' }),
      ).rejects.toThrow(RangoInvalidoError);
    });

    it('fechaDesde > fechaHasta → RangoInvalidoError', async () => {
      await expect(
        service.consultarEvolucionPatrimonio(TENANT_ID, {
          fechaDesde: '2026-12-31',
          fechaHasta: '2026-01-01',
        }),
      ).rejects.toThrow(RangoInvalidoError);
    });

    it('periodoFiscalId inexistente → PeriodoNoEncontradoError', async () => {
      periodosReader.obtenerRangoFechas.mockResolvedValue(null);
      await expect(
        service.consultarEvolucionPatrimonio(TENANT_ID, { periodoFiscalId: PERIODO_ID }),
      ).rejects.toThrow(PeriodoNoEncontradoError);
    });

    it('gestionId inexistente → GestionNoEncontradaError', async () => {
      periodosReader.obtenerRangoGestion.mockResolvedValue(null);
      await expect(
        service.consultarEvolucionPatrimonio(TENANT_ID, { gestionId: GESTION_ID }),
      ).rejects.toThrow(GestionNoEncontradaError);
    });
  });

  describe('lecturas del port', () => {
    it('el saldo inicial corta en el día PREVIO al inicio del rango', async () => {
      await service.consultarEvolucionPatrimonio(TENANT_ID, { gestionId: GESTION_ID });

      // Primera llamada = saldo inicial → fechaCorte = 2025-12-31 (desde − 1 día)
      const llamadaInicial = eeffReader.obtenerSaldosHasta.mock.calls[0];
      expect(llamadaInicial[0]).toBe(TENANT_ID);
      expect(llamadaInicial[1].fechaCorte.toISOString()).toBe(
        new Date(Date.UTC(2025, 11, 31)).toISOString(),
      );

      // Segunda llamada = saldo final → fechaCorte = 2026-12-31 (hasta)
      const llamadaFinal = eeffReader.obtenerSaldosHasta.mock.calls[1];
      expect(llamadaFinal[1].fechaCorte.toISOString()).toBe(HASTA.toISOString());
    });

    it('propaga incluirAnulados a todas las lecturas', async () => {
      await service.consultarEvolucionPatrimonio(TENANT_ID, {
        gestionId: GESTION_ID,
        incluirAnulados: true,
      });

      expect(eeffReader.obtenerSaldosHasta.mock.calls[0][1].incluirAnulados).toBe(true);
      expect(eeffReader.obtenerSaldosEnRango).toHaveBeenCalledWith(TENANT_ID, DESDE, HASTA, true);
    });
  });

  describe('respuesta', () => {
    it('arma la matriz y serializa fechas + montos', async () => {
      eeffReader.obtenerEstructuraCuentas.mockResolvedValue([CAPITAL]);
      eeffReader.obtenerSaldosHasta
        .mockResolvedValueOnce([saldo('cap', '0.00', '100000.00')]) // inicial
        .mockResolvedValueOnce([saldo('cap', '0.00', '150000.00')]); // final
      eeffReader.obtenerSaldosEnRango.mockResolvedValue([saldo('cap', '0.00', '50000.00')]);

      const res = await service.consultarEvolucionPatrimonio(TENANT_ID, { gestionId: GESTION_ID });

      expect(res.fechaDesde).toBe('2026-01-01');
      expect(res.fechaHasta).toBe('2026-12-31');
      expect(res.componentes).toHaveLength(1);
      expect(res.componentes[0]!.saldoInicialBob).toBe('100000.00');
      expect(res.componentes[0]!.saldoFinalBob).toBe('150000.00');
      expect(res.totales.saldoFinalBob).toBe('150000.00');
      expect(res.cuadra).toBe(true);
    });
  });
});
