import { Decimal } from '@prisma/client/runtime/library';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import { HojaTrabajoService } from './hoja-trabajo.service';
import {
  PeriodoNoEncontradoError,
  RangoAmbiguoError,
  RangoInvalidoError,
  RangoRequeridoError,
} from './domain/hoja-trabajo-errors';
import type {
  CuentaEstructuraRow,
  EeffSaldosReaderPort,
  SaldoCuentaSeparadoRow,
} from './ports/eeff-saldos-reader.port';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

/**
 * Tests unit del HojaTrabajoService con mocks TIPADOS de los ports
 * (NO Prisma, §7.8). Cubre la resolución del rango (REQ-HT-01/02), la
 * orquestación (REQ-HT-03..10) y la propagación del tenantId (CRÍTICO §4.2).
 */

const TENANT = 'org-hoja-123';

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

function saldosSeparadosBase(): SaldoCuentaSeparadoRow[] {
  return [
    {
      cuentaId: 'c1',
      debitoOrdinarioBob: new Decimal('1000'),
      creditoOrdinarioBob: new Decimal('0'),
      debitoAjusteBob: new Decimal('0'),
      creditoAjusteBob: new Decimal('0'),
    },
    {
      cuentaId: 'c2',
      debitoOrdinarioBob: new Decimal('0'),
      creditoOrdinarioBob: new Decimal('1000'),
      debitoAjusteBob: new Decimal('0'),
      creditoAjusteBob: new Decimal('0'),
    },
  ];
}

interface Mocks {
  eeff: jest.Mocked<EeffSaldosReaderPort>;
  periodos: jest.Mocked<PeriodosReaderPort>;
  service: HojaTrabajoService;
}

function setup(): Mocks {
  const eeff = {
    obtenerSaldosHasta: jest.fn(),
    obtenerSaldosEnRango: jest.fn(),
    obtenerEstructuraCuentas: jest.fn().mockResolvedValue(estructuraBase()),
    obtenerSaldosEnRangoSeparandoAjustes: jest.fn().mockResolvedValue(saldosSeparadosBase()),
  } as unknown as jest.Mocked<EeffSaldosReaderPort>;

  const periodos = {
    obtenerPorFecha: jest.fn(),
    obtenerRangoFechas: jest.fn(),
    obtenerReaperturaActiva: jest.fn(),
    obtenerRangoGestionPorFecha: jest.fn(),
    obtenerRangoGestion: jest.fn(),
  } as unknown as jest.Mocked<PeriodosReaderPort>;

  const service = new HojaTrabajoService(eeff, periodos);
  return { eeff, periodos, service };
}

describe('HojaTrabajoService', () => {
  // ============================================================
  // REQ-HT-01: Resolución de modo (XOR)
  // ============================================================

  describe('REQ-HT-01: resolución del rango por dos modos excluyentes', () => {
    it('modo rango directo: usa desde/hasta y responde 200', async () => {
      const { service, eeff } = setup();

      const res = await service.consultarHojaTrabajo(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(res.fechaDesde).toBe('2026-04-01');
      expect(res.fechaHasta).toBe('2026-04-30');
      expect(eeff.obtenerSaldosEnRangoSeparandoAjustes).toHaveBeenCalledTimes(1);
    });

    it('modo período: resuelve el rango vía obtenerRangoFechas', async () => {
      const { service, periodos } = setup();
      periodos.obtenerRangoFechas.mockResolvedValue({
        desde: new Date(Date.UTC(2026, 3, 1)),
        hasta: new Date(Date.UTC(2026, 3, 30)),
      });

      const res = await service.consultarHojaTrabajo(TENANT, {
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
        service.consultarHojaTrabajo(TENANT, {
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
        service.consultarHojaTrabajo(TENANT, { incluirAnulados: false }),
      ).rejects.toBeInstanceOf(RangoRequeridoError);
    });
  });

  // ============================================================
  // REQ-HT-02: Validación de fechas
  // ============================================================

  describe('REQ-HT-02: validación de fechas', () => {
    it('fecha semánticamente inválida → RangoInvalidoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarHojaTrabajo(TENANT, {
          desde: '2026-02-30',
          hasta: '2026-04-30',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoInvalidoError);
    });

    it('desde > hasta → RangoInvalidoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarHojaTrabajo(TENANT, {
          desde: '2026-04-30',
          hasta: '2026-04-01',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoInvalidoError);
    });

    it('modo rango incompleto (solo desde) → RangoInvalidoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarHojaTrabajo(TENANT, {
          desde: '2026-04-01',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoInvalidoError);
    });

    it('modo rango incompleto (solo hasta) → RangoInvalidoError', async () => {
      const { service } = setup();

      await expect(
        service.consultarHojaTrabajo(TENANT, {
          hasta: '2026-04-30',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(RangoInvalidoError);
    });

    it('periodoFiscalId inexistente (null del port) → PeriodoNoEncontradoError', async () => {
      const { service, periodos } = setup();
      periodos.obtenerRangoFechas.mockResolvedValue(null);

      await expect(
        service.consultarHojaTrabajo(TENANT, {
          periodoFiscalId: 'p-ajeno',
          incluirAnulados: false,
        }),
      ).rejects.toBeInstanceOf(PeriodoNoEncontradoError);
    });
  });

  // ============================================================
  // REQ-HT-03..10: Orquestación
  // ============================================================

  describe('REQ-HT-03/10: orquestación correcta', () => {
    it('usa obtenerSaldosEnRangoSeparandoAjustes, NUNCA obtenerSaldosEnRango ni obtenerSaldosHasta', async () => {
      const { service, eeff } = setup();

      await service.consultarHojaTrabajo(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(eeff.obtenerSaldosEnRangoSeparandoAjustes).toHaveBeenCalledTimes(1);
      expect(eeff.obtenerSaldosEnRango).not.toHaveBeenCalled();
      expect(eeff.obtenerSaldosHasta).not.toHaveBeenCalled();
    });

    it('produce un reporte con estructura de 12 columnas y cuadres', async () => {
      const { service } = setup();

      const res = await service.consultarHojaTrabajo(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(res.cuadres.cuadra).toBe(true);
      expect(res.totales.sumasDebe).toBe('1000.00');
      expect(res.totales.sumasHaber).toBe('1000.00');
      // 2 cuentas de detalle + 1 fila sintética de Utilidad del Ejercicio
      expect(res.lineas.length).toBeGreaterThanOrEqual(2);
      // Verificar que la respuesta tiene las 12 columnas
      const linea = res.lineas[0]!;
      expect(typeof linea.sumasDebe).toBe('string');
      expect(typeof linea.sumasHaber).toBe('string');
      expect(typeof linea.saldoDeudor).toBe('string');
      expect(typeof linea.saldoAcreedor).toBe('string');
      expect(typeof linea.ajustesDebe).toBe('string');
      expect(typeof linea.ajustesHaber).toBe('string');
      expect(typeof linea.saldoAjustadoDeudor).toBe('string');
      expect(typeof linea.saldoAjustadoAcreedor).toBe('string');
      expect(typeof linea.erPerdidas).toBe('string');
      expect(typeof linea.erGanancias).toBe('string');
      expect(typeof linea.bgActivo).toBe('string');
      expect(typeof linea.bgPasPat).toBe('string');
    });

    it('obtenerSaldosEnRangoSeparandoAjustes y obtenerEstructuraCuentas se llaman en paralelo', async () => {
      const { service, eeff } = setup();
      const callOrder: string[] = [];

      eeff.obtenerSaldosEnRangoSeparandoAjustes.mockImplementation(async () => {
        callOrder.push('saldos');
        return saldosSeparadosBase();
      });
      eeff.obtenerEstructuraCuentas.mockImplementation(async () => {
        callOrder.push('estructura');
        return estructuraBase();
      });

      await service.consultarHojaTrabajo(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      // Ambos se llaman, orden no garantizado por Promise.all
      expect(callOrder).toContain('saldos');
      expect(callOrder).toContain('estructura');
    });
  });

  describe('incluirAnulados propagado al port', () => {
    it('propaga incluirAnulados=true al port', async () => {
      const { service, eeff } = setup();

      await service.consultarHojaTrabajo(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: true,
      });

      expect(eeff.obtenerSaldosEnRangoSeparandoAjustes).toHaveBeenCalledWith(
        TENANT,
        expect.any(Date),
        expect.any(Date),
        true,
      );
    });

    it('propaga incluirAnulados=false', async () => {
      const { service, eeff } = setup();

      await service.consultarHojaTrabajo(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(eeff.obtenerSaldosEnRangoSeparandoAjustes).toHaveBeenCalledWith(
        TENANT,
        expect.any(Date),
        expect.any(Date),
        false,
      );
    });
  });

  describe('tenantId propagado a cada lectura (CRÍTICO §4.2)', () => {
    it('pasa el tenantId como primer argumento a saldos y estructura', async () => {
      const { service, eeff } = setup();

      await service.consultarHojaTrabajo(TENANT, {
        desde: '2026-04-01',
        hasta: '2026-04-30',
        incluirAnulados: false,
      });

      expect(eeff.obtenerSaldosEnRangoSeparandoAjustes.mock.calls[0]![0]).toBe(TENANT);
      expect(eeff.obtenerEstructuraCuentas).toHaveBeenCalledWith(TENANT);
    });
  });
});
