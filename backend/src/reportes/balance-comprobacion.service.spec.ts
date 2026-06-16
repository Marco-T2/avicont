import { Decimal } from '@prisma/client/runtime/library';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import { BalanceComprobacionService } from './balance-comprobacion.service';
import {
  PeriodoNoEncontradoError,
  RangoAmbiguoError,
  RangoInvalidoError,
  RangoRequeridoError,
} from './domain/balance-comprobacion-errors';
import type {
  CuentaEstructuraRow,
  EeffSaldosReaderPort,
  SaldoCuentaRow,
} from './ports/eeff-saldos-reader.port';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

/**
 * Tests unit del BalanceComprobacionService con mocks TIPADOS de los ports
 * (NO Prisma, §7.8). Cubre la resolución del rango (REQ-BC-01/02), la
 * orquestación (REQ-BC-03/06/08) y la propagación del tenantId (REQ-BC-09).
 */

const TENANT = 'org-123';

function estructuraBase(): CuentaEstructuraRow[] {
  return [
    {
      id: 'c1',
      parentId: null,
      nivel: 4,
      esDetalle: true,
      esContraria: false,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '1101',
      nombre: 'Caja MN',
      actividadFlujo: null,
    },
    {
      id: 'c2',
      parentId: null,
      nivel: 4,
      esDetalle: true,
      esContraria: false,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4101',
      nombre: 'Ventas',
      actividadFlujo: null,
    },
  ];
}

function saldosBase(): SaldoCuentaRow[] {
  return [
    { cuentaId: 'c1', totalDebitoBob: new Decimal('1000'), totalCreditoBob: new Decimal('0') },
    { cuentaId: 'c2', totalDebitoBob: new Decimal('0'), totalCreditoBob: new Decimal('1000') },
  ];
}

interface Mocks {
  eeff: jest.Mocked<EeffSaldosReaderPort>;
  periodos: jest.Mocked<PeriodosReaderPort>;
  service: BalanceComprobacionService;
}

function setup(): Mocks {
  const eeff = {
    obtenerSaldosHasta: jest.fn(),
    obtenerSaldosEnRango: jest.fn().mockResolvedValue(saldosBase()),
    obtenerEstructuraCuentas: jest.fn().mockResolvedValue(estructuraBase()),
    obtenerSaldosEnRangoSeparandoAjustes: jest.fn(),
  } as unknown as jest.Mocked<EeffSaldosReaderPort>;

  const periodos = {
    obtenerPorFecha: jest.fn(),
    obtenerRangoFechas: jest.fn(),
    obtenerReaperturaActiva: jest.fn(),
    obtenerRangoGestionPorFecha: jest.fn(),
    obtenerRangoGestion: jest.fn(),
  } as unknown as jest.Mocked<PeriodosReaderPort>;

  const service = new BalanceComprobacionService(eeff, periodos);
  return { eeff, periodos, service };
}

describe('BalanceComprobacionService', () => {
  // ============================================================
  // REQ-BC-01: Resolución de modo (XOR)
  // ============================================================

  describe('REQ-BC-01: resolución del rango por dos modos excluyentes', () => {
    it('modo rango directo: usa desde/hasta y responde 200', async () => {
      const { service, eeff } = setup();

      const res = await service.consultarBalanceComprobacion(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(res.fechaDesde).toBe('2026-04-01');
      expect(res.fechaHasta).toBe('2026-04-30');
      expect(eeff.obtenerSaldosEnRango).toHaveBeenCalledTimes(1);
    });

    it('modo período: resuelve el rango vía obtenerRangoFechas', async () => {
      const { service, periodos } = setup();
      periodos.obtenerRangoFechas.mockResolvedValue({
        desde: new Date(Date.UTC(2026, 3, 1)),
        hasta: new Date(Date.UTC(2026, 3, 30)),
      });

      const res = await service.consultarBalanceComprobacion(TENANT, {
        periodoFiscalId: 'p-1',
        incluirAnulados: false,
      });

      expect(periodos.obtenerRangoFechas).toHaveBeenCalledWith(TENANT, 'p-1');
      expect(res.fechaDesde).toBe('2026-04-01');
      expect(res.fechaHasta).toBe('2026-04-30');
    });

    it('ambos modos a la vez → RangoAmbiguoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarBalanceComprobacion(TENANT, {
          desde: '2026-04-01',
          hasta: '2026-04-30',
          periodoFiscalId: 'p-1',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoAmbiguoError);
    });

    it('ningún modo → RangoRequeridoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarBalanceComprobacion(TENANT, { incluirAnulados: false }),
      ).rejects.toBeInstanceOf(RangoRequeridoError);
    });
  });

  // ============================================================
  // REQ-BC-02: Validación de fechas
  // ============================================================

  describe('REQ-BC-02: validación de fechas', () => {
    it('fecha semánticamente inválida → RangoInvalidoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarBalanceComprobacion(TENANT, {
          desde: '2026-02-30',
          hasta: '2026-04-30',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoInvalidoError);
    });

    it('desde > hasta → RangoInvalidoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarBalanceComprobacion(TENANT, {
          desde: '2026-04-30',
          hasta: '2026-04-01',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoInvalidoError);
    });

    it('modo rango incompleto (solo desde) → RangoInvalidoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarBalanceComprobacion(TENANT, {
          desde: '2026-04-01',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoInvalidoError);
    });

    it('modo rango incompleto (solo hasta) → RangoInvalidoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarBalanceComprobacion(TENANT, {
          hasta: '2026-04-30',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoInvalidoError);
    });

    it('periodoFiscalId inexistente (null del port) → PeriodoNoEncontradoError', async () => {
      const { service, periodos } = setup();
      periodos.obtenerRangoFechas.mockResolvedValue(null);

      await expect(
        service.consultarBalanceComprobacion(TENANT, {
          periodoFiscalId: 'p-ajeno',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(PeriodoNoEncontradoError);
    });
  });

  // ============================================================
  // REQ-BC-03/06/08: Orquestación
  // ============================================================

  describe('REQ-BC-03/06: orquestación correcta', () => {
    it('usa obtenerSaldosEnRango (flujo), NUNCA obtenerSaldosHasta', async () => {
      const { service, eeff } = setup();

      await service.consultarBalanceComprobacion(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(eeff.obtenerSaldosEnRango).toHaveBeenCalledTimes(1);
      expect(eeff.obtenerSaldosHasta).not.toHaveBeenCalled();
    });

    it('produce un reporte cuadrado con saldos balanceados', async () => {
      const { service } = setup();

      const res = await service.consultarBalanceComprobacion(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(res.cuadra).toBe(true);
      expect(res.totalSumasDebito).toBe('1000.00');
      expect(res.totalSumasCredito).toBe('1000.00');
      expect(res.lineas).toHaveLength(2);
    });
  });

  describe('REQ-BC-08: incluirAnulados', () => {
    it('propaga incluirAnulados=true al port', async () => {
      const { service, eeff } = setup();

      await service.consultarBalanceComprobacion(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: true,
      });

      expect(eeff.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT,
        expect.any(Date),
        expect.any(Date),
        true,
      );
    });

    it('propaga incluirAnulados=false por default', async () => {
      const { service, eeff } = setup();

      await service.consultarBalanceComprobacion(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(eeff.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT,
        expect.any(Date),
        expect.any(Date),
        false,
      );
    });
  });

  // ============================================================
  // REQ-BC-09: tenantId como primer argumento de cada lectura
  // ============================================================

  describe('REQ-BC-09: tenantId propagado a cada lectura (CRÍTICO)', () => {
    it('pasa el tenantId como primer argumento a saldos y estructura', async () => {
      const { service, eeff } = setup();

      await service.consultarBalanceComprobacion(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(eeff.obtenerSaldosEnRango.mock.calls[0]![0]).toBe(TENANT);
      expect(eeff.obtenerEstructuraCuentas).toHaveBeenCalledWith(TENANT);
    });
  });
});
