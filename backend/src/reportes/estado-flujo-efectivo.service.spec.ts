import { Decimal } from '@prisma/client/runtime/library';

import {
  ActividadFlujo,
  ClaseCuenta,
  NaturalezaCuenta,
  SubClaseCuenta,
} from '@/common/domain/enums';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import {
  FlujoEfectivoPeriodoNoEncontradoError,
  FlujoEfectivoRangoAmbiguoError,
  FlujoEfectivoRangoInvalidoError,
  FlujoEfectivoRangoRequeridoError,
} from './domain/estado-flujo-efectivo-errors';
import { EstadoFlujoEfectivoService } from './estado-flujo-efectivo.service';
import type {
  CuentaEstructuraRow,
  EeffSaldosReaderPort,
  SaldoCuentaRow,
} from './ports/eeff-saldos-reader.port';

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
const DESDE = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01
const HASTA = new Date(Date.UTC(2026, 11, 31)); // 2026-12-31

const CAJA: CuentaEstructuraRow = {
  id: 'caja',
  parentId: null,
  nivel: 4,
  esDetalle: true,
  esContraria: false,
  claseCuenta: ClaseCuenta.ACTIVO,
  subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
  naturaleza: NaturalezaCuenta.DEUDORA,
  codigoInterno: '1.1.1.001',
  nombre: 'Caja MN',
  actividadFlujo: null,
};

const CAPITAL: CuentaEstructuraRow = {
  id: 'cap',
  parentId: null,
  nivel: 4,
  esDetalle: true,
  esContraria: false,
  claseCuenta: ClaseCuenta.PATRIMONIO,
  subClaseCuenta: SubClaseCuenta.PATRIMONIO_CAPITAL,
  naturaleza: NaturalezaCuenta.ACREEDORA,
  codigoInterno: '3.1.1.001',
  nombre: 'Capital Social',
  actividadFlujo: ActividadFlujo.FINANCIACION,
};

// ============================================================
// Tests
// ============================================================

describe('EstadoFlujoEfectivoService (unit)', () => {
  let service: EstadoFlujoEfectivoService;
  let eeffReader: MockEeffSaldosReader;
  let periodosReader: MockPeriodosReader;

  beforeEach(() => {
    eeffReader = makeEeffSaldosReaderMock();
    periodosReader = makePeriodosReaderMock();
    service = new EstadoFlujoEfectivoService(
      eeffReader as unknown as EeffSaldosReaderPort,
      periodosReader as unknown as PeriodosReaderPort,
    );

    periodosReader.obtenerRangoFechas.mockResolvedValue({ desde: DESDE, hasta: HASTA });
    eeffReader.obtenerSaldosHasta.mockResolvedValue([]);
    eeffReader.obtenerSaldosEnRango.mockResolvedValue([]);
    eeffReader.obtenerEstructuraCuentas.mockResolvedValue([]);
  });

  describe('resolución de rango', () => {
    it('sin ningún modo → FlujoEfectivoRangoRequeridoError', async () => {
      await expect(
        service.consultarFlujoEfectivo(TENANT_ID, { incluirAnulados: false }),
      ).rejects.toThrow(FlujoEfectivoRangoRequeridoError);
    });

    it('ambos modos a la vez → FlujoEfectivoRangoAmbiguoError', async () => {
      await expect(
        service.consultarFlujoEfectivo(TENANT_ID, {
          desde: '2026-01-01',
          hasta: '2026-12-31',
          periodoFiscalId: PERIODO_ID,
          incluirAnulados: false,
        }),
      ).rejects.toThrow(FlujoEfectivoRangoAmbiguoError);
    });

    it('desde sin hasta → FlujoEfectivoRangoInvalidoError', async () => {
      await expect(
        service.consultarFlujoEfectivo(TENANT_ID, { desde: '2026-01-01', incluirAnulados: false }),
      ).rejects.toThrow(FlujoEfectivoRangoInvalidoError);
    });

    it('desde > hasta → FlujoEfectivoRangoInvalidoError', async () => {
      await expect(
        service.consultarFlujoEfectivo(TENANT_ID, {
          desde: '2026-12-31',
          hasta: '2026-01-01',
          incluirAnulados: false,
        }),
      ).rejects.toThrow(FlujoEfectivoRangoInvalidoError);
    });

    it('fecha con formato inválido → FlujoEfectivoRangoInvalidoError', async () => {
      await expect(
        service.consultarFlujoEfectivo(TENANT_ID, {
          desde: '2026-13-40',
          hasta: '2026-12-31',
          incluirAnulados: false,
        }),
      ).rejects.toThrow(FlujoEfectivoRangoInvalidoError);
    });

    it('periodoFiscalId inexistente → FlujoEfectivoPeriodoNoEncontradoError', async () => {
      periodosReader.obtenerRangoFechas.mockResolvedValue(null);
      await expect(
        service.consultarFlujoEfectivo(TENANT_ID, {
          periodoFiscalId: PERIODO_ID,
          incluirAnulados: false,
        }),
      ).rejects.toThrow(FlujoEfectivoPeriodoNoEncontradoError);
    });
  });

  describe('lecturas del port', () => {
    it('saldo inicial corta en el día PREVIO al inicio del rango', async () => {
      await service.consultarFlujoEfectivo(TENANT_ID, {
        desde: '2026-01-01',
        hasta: '2026-12-31',
        incluirAnulados: false,
      });

      const llamadaInicial = eeffReader.obtenerSaldosHasta.mock.calls[0];
      expect(llamadaInicial[0]).toBe(TENANT_ID);
      expect(llamadaInicial[1].fechaCorte.toISOString()).toBe(
        new Date(Date.UTC(2025, 11, 31)).toISOString(),
      );

      const llamadaFinal = eeffReader.obtenerSaldosHasta.mock.calls[1];
      expect(llamadaFinal[1].fechaCorte.toISOString()).toBe(HASTA.toISOString());
    });

    it('propaga incluirAnulados a todas las lecturas', async () => {
      await service.consultarFlujoEfectivo(TENANT_ID, {
        periodoFiscalId: PERIODO_ID,
        incluirAnulados: true,
      });

      expect(eeffReader.obtenerSaldosHasta.mock.calls[0][1].incluirAnulados).toBe(true);
      // excluirCierre SIEMPRE true: el resultado de operación del EFE debe partir del
      // resultado OPERATIVO del período, no del residuo post-cierre (ver test del builder
      // "el resultado del ejercicio trasladado a patrimonio NO se doble-cuenta").
      expect(eeffReader.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT_ID,
        DESDE,
        HASTA,
        true,
        true,
      );
    });

    it('SIEMPRE excluye CIERRE del rango (excluirCierre=true), independiente de incluirAnulados', async () => {
      await service.consultarFlujoEfectivo(TENANT_ID, {
        desde: '2026-01-01',
        hasta: '2026-12-31',
        incluirAnulados: false,
      });

      // Sin excluir CIERRE, consultar el EFE de una gestión cerrada daría resultado=0
      // (el cierre pone ingresos/egresos en cero) y descuadre = utilidad del ejercicio.
      const [, , , incluirAnulados, excluirCierre] = eeffReader.obtenerSaldosEnRango.mock.calls[0];
      expect(incluirAnulados).toBe(false);
      expect(excluirCierre).toBe(true);
    });
  });

  describe('respuesta', () => {
    it('arma el EFE y serializa fechas + montos string', async () => {
      // Aporte de capital 50000 + resultado del ejercicio
      eeffReader.obtenerEstructuraCuentas.mockResolvedValue([CAJA, CAPITAL]);
      eeffReader.obtenerSaldosHasta
        .mockResolvedValueOnce([]) // inicial
        .mockResolvedValueOnce([saldo('caja', '50000', '0'), saldo('cap', '0', '50000')]); // final
      eeffReader.obtenerSaldosEnRango.mockResolvedValue([]);

      const res = await service.consultarFlujoEfectivo(TENANT_ID, {
        periodoFiscalId: PERIODO_ID,
        incluirAnulados: false,
      });

      expect(res.fechaDesde).toBe('2026-01-01');
      expect(res.fechaHasta).toBe('2026-12-31');
      expect(res.efectivoFinal).toBe('50000.00');
      expect(res.financiacion.subtotal).toBe('50000.00');
      expect(res.variacionNeta).toBe('50000.00');
      expect(res.cuadra).toBe(true);
      expect(typeof res.diferencia).toBe('string');
    });
  });
});
