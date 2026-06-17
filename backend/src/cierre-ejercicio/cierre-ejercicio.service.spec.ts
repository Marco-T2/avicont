import { GestionFiscalStatus, EstadoComprobante } from '@prisma/client';

import { TipoEmpresa } from '@/common/domain/enums';
import type { PrismaService } from '@/common/prisma.service';

import { CierreEjercicioService } from './cierre-ejercicio.service';
import {
  CierreConfigCuentaFaltanteError,
  CierreGestionCerradaError,
  CierreGestionNoEncontradaError,
  CierrePeriodoNoListoError,
  CierreSinResultadoError,
  CierreYaParcialmenteContabilizadoError,
} from './domain/cierre-errors';
import type { SaldoCuentaCierre } from './domain/cierre-builders';
import { Money } from '@/common/domain/money';
import { ClaseCuenta, NaturalezaCuenta } from '@/common/domain/enums';
import type { CierreSaldosReaderPort } from './ports/cierre-saldos-reader.port';
import type { CierreConfigReaderPort, CierreConfig } from './ports/cierre-config-reader.port';
import type {
  CierreGestionReaderPort,
  GestionParaCierre,
} from './ports/cierre-gestion-reader.port';
import type { CierreComprobanteWriterPort } from '@/comprobantes/ports/cierre-comprobante-writer.port';

// ============================================================
// Helpers / factories de mocks
// ============================================================

const TENANT = 'tenant-a';
const GESTION = 'gestion-1';
const USER = 'user-1';

const TRANSITORIA = 'cta-resultado'; // 3.1.4.001
const ACUMULADOS = 'cta-acumulados'; // 3.1.3.001
const VENTAS = 'cta-ventas';
const COSTO = 'cta-costo';
const SUELDOS = 'cta-sueldos';

function gestionLista(over: Partial<GestionParaCierre> = {}): GestionParaCierre {
  return {
    id: GESTION,
    year: 2026,
    status: GestionFiscalStatus.ABIERTA,
    periodosCount: 12,
    periodosCerradosCount: 11,
    periodoMesCierre: {
      id: 'periodo-12',
      year: 2026,
      month: 12,
      estaAbierto: true,
      fechaCierre: new Date(Date.UTC(2026, 11, 31)),
    },
    rangoGestion: {
      desde: new Date(Date.UTC(2026, 0, 1)),
      hasta: new Date(Date.UTC(2026, 11, 31)),
    },
    comprobantesDeCierre: [],
    ...over,
  };
}

function configDefault(): CierreConfig {
  return {
    resultadoEjercicioId: TRANSITORIA,
    resultadosAcumuladosId: ACUMULADOS,
    tipoEmpresaPrincipal: TipoEmpresa.COMERCIAL,
  };
}

function saldo(
  cuentaId: string,
  clase: ClaseCuenta,
  naturaleza: NaturalezaCuenta,
  debito: string,
  credito: string,
): SaldoCuentaCierre {
  return {
    cuentaId,
    clase,
    naturaleza,
    debitoBob: Money.of(debito),
    creditoBob: Money.of(credito),
  };
}

/** Saldos de la utilidad del design §3.4: Ventas 100k cr, Costo 60k db, Sueldos 20k db → +20k. */
function saldosUtilidad(): SaldoCuentaCierre[] {
  return [
    saldo(VENTAS, ClaseCuenta.INGRESO, NaturalezaCuenta.ACREEDORA, '0', '100000'),
    saldo(COSTO, ClaseCuenta.EGRESO, NaturalezaCuenta.DEUDORA, '60000', '0'),
    saldo(SUELDOS, ClaseCuenta.EGRESO, NaturalezaCuenta.DEUDORA, '20000', '0'),
  ];
}

/** Saldos de la pérdida del design §3.5: Ventas 50k cr, Costo 70k db → −20k. */
function saldosPerdida(): SaldoCuentaCierre[] {
  return [
    saldo(VENTAS, ClaseCuenta.INGRESO, NaturalezaCuenta.ACREEDORA, '0', '50000'),
    saldo(COSTO, ClaseCuenta.EGRESO, NaturalezaCuenta.DEUDORA, '70000', '0'),
  ];
}

interface Mocks {
  gestionReader: jest.Mocked<CierreGestionReaderPort>;
  configReader: jest.Mocked<CierreConfigReaderPort>;
  saldosReader: jest.Mocked<CierreSaldosReaderPort>;
  writer: jest.Mocked<CierreComprobanteWriterPort>;
  prisma: Pick<PrismaService, '$transaction'>;
}

function buildService(
  over: {
    gestion?: GestionParaCierre | null;
    config?: CierreConfig;
    saldos?: SaldoCuentaCierre[];
  } = {},
): { service: CierreEjercicioService; mocks: Mocks } {
  const gestionReader = {
    obtenerParaCierre: jest
      .fn()
      .mockResolvedValue(over.gestion === undefined ? gestionLista() : over.gestion),
  } as unknown as jest.Mocked<CierreGestionReaderPort>;

  const configReader = {
    obtenerConfig: jest.fn().mockResolvedValue(over.config ?? configDefault()),
  } as unknown as jest.Mocked<CierreConfigReaderPort>;

  const saldosReader = {
    obtenerSaldosDeResultado: jest.fn().mockResolvedValue(over.saldos ?? saldosUtilidad()),
  } as unknown as jest.Mocked<CierreSaldosReaderPort>;

  let seq = 0;
  const writer = {
    crearBorradorSistema: jest.fn().mockImplementation(() => {
      seq += 1;
      return Promise.resolve({ id: `cierre-${seq}` });
    }),
    eliminarBorradorSistema: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CierreComprobanteWriterPort>;

  // $transaction ejecuta el callback con un tx fake (los mocks ignoran el tx).
  const prisma = {
    $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb({})),
  } as unknown as Pick<PrismaService, '$transaction'>;

  const service = new CierreEjercicioService(
    gestionReader,
    configReader,
    saldosReader,
    writer,
    prisma as PrismaService,
  );

  return { service, mocks: { gestionReader, configReader, saldosReader, writer, prisma } };
}

// ============================================================
// Tests
// ============================================================

describe('CierreEjercicioService', () => {
  describe('generarCierre — caso feliz', () => {
    it('genera los 3 comprobantes de cierre (utilidad) con slots y flags correctos', async () => {
      const { service, mocks } = buildService();

      const resultado = await service.generarCierre(GESTION, TENANT, USER);

      expect(mocks.writer.crearBorradorSistema).toHaveBeenCalledTimes(3);
      const slots = mocks.writer.crearBorradorSistema.mock.calls.map(([d]) => d.origenTipo);
      expect(slots).toEqual(['CIERRE_GASTOS', 'CIERRE_INGRESOS', 'CIERRE_RESULTADO']);

      for (const [data] of mocks.writer.crearBorradorSistema.mock.calls) {
        expect(data.tipo).toBe('CIERRE');
        expect(data.tenantId).toBe(TENANT);
        expect(data.origenId).toBe(GESTION);
        expect(data.createdByUserId).toBe(USER);
        expect(data.fechaContable).toEqual(new Date(Date.UTC(2026, 11, 31)));
        expect(data.periodoFiscalId).toBe('periodo-12');
      }
      expect(resultado.cierres).toHaveLength(3);
    });

    it('todo se crea dentro de UNA transacción', async () => {
      const { service, mocks } = buildService();
      await service.generarCierre(GESTION, TENANT, USER);
      expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('las líneas de #1 (cerrar gastos) cuadran con la transitoria al DEBE', async () => {
      const { service, mocks } = buildService();
      await service.generarCierre(GESTION, TENANT, USER);

      const [gastos] = mocks.writer.crearBorradorSistema.mock.calls[0]!;
      // Costo 60000 HABER, Sueldos 20000 HABER, transitoria 80000 DEBE.
      const transit = gastos.lineas.find((l) => l.cuentaId === TRANSITORIA)!;
      expect(transit.debito.toString()).toBe('80000');
      expect(transit.credito.toString()).toBe('0');
    });
  });

  describe('generarCierre — SKIP-on-zero', () => {
    it('sin cuentas EGRESO → no crea #1 (solo #2 y #3)', async () => {
      const saldos = [
        saldo(VENTAS, ClaseCuenta.INGRESO, NaturalezaCuenta.ACREEDORA, '0', '100000'),
      ];
      const { service, mocks } = buildService({ saldos });
      await service.generarCierre(GESTION, TENANT, USER);

      const slots = mocks.writer.crearBorradorSistema.mock.calls.map(([d]) => d.origenTipo);
      expect(slots).toEqual(['CIERRE_INGRESOS', 'CIERRE_RESULTADO']);
    });

    it('resultado 0 → no crea #3 (solo #1 y #2)', async () => {
      const saldos = [
        saldo(VENTAS, ClaseCuenta.INGRESO, NaturalezaCuenta.ACREEDORA, '0', '50000'),
        saldo(COSTO, ClaseCuenta.EGRESO, NaturalezaCuenta.DEUDORA, '50000', '0'),
      ];
      const { service, mocks } = buildService({ saldos });
      await service.generarCierre(GESTION, TENANT, USER);

      const slots = mocks.writer.crearBorradorSistema.mock.calls.map(([d]) => d.origenTipo);
      expect(slots).toEqual(['CIERRE_GASTOS', 'CIERRE_INGRESOS']);
    });

    it('sin ningún movimiento de resultado → CierreSinResultadoError', async () => {
      const { service, mocks } = buildService({ saldos: [] });
      await expect(service.generarCierre(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
        CierreSinResultadoError,
      );
      expect(mocks.writer.crearBorradorSistema).not.toHaveBeenCalled();
    });
  });

  describe('generarCierre — gates de estado de gestión / períodos', () => {
    it('gestión no encontrada → CierreGestionNoEncontradaError', async () => {
      const { service } = buildService({ gestion: null });
      await expect(service.generarCierre(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
        CierreGestionNoEncontradaError,
      );
    });

    it('gestión CERRADA → CierreGestionCerradaError', async () => {
      const { service } = buildService({
        gestion: gestionLista({ status: GestionFiscalStatus.CERRADA }),
      });
      await expect(service.generarCierre(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
        CierreGestionCerradaError,
      );
    });

    it('mesCierre CERRADO → CierrePeriodoNoListoError', async () => {
      const { service } = buildService({
        gestion: gestionLista({
          periodosCerradosCount: 12,
          periodoMesCierre: {
            id: 'periodo-12',
            year: 2026,
            month: 12,
            estaAbierto: false,
            fechaCierre: new Date(Date.UTC(2026, 11, 31)),
          },
        }),
      });
      await expect(service.generarCierre(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
        CierrePeriodoNoListoError,
      );
    });

    it('período previo ABIERTO (solo 10 cerrados) → CierrePeriodoNoListoError', async () => {
      const { service } = buildService({
        gestion: gestionLista({ periodosCerradosCount: 10 }),
      });
      await expect(service.generarCierre(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
        CierrePeriodoNoListoError,
      );
    });
  });

  describe('generarCierre — config', () => {
    it('config faltante propaga CierreConfigCuentaFaltanteError', async () => {
      const { service, mocks } = buildService();
      mocks.configReader.obtenerConfig.mockRejectedValueOnce(
        new CierreConfigCuentaFaltanteError('resultadoEjercicioId'),
      );
      await expect(service.generarCierre(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
        CierreConfigCuentaFaltanteError,
      );
    });
  });

  describe('generarCierre — idempotencia', () => {
    it('cierres previos en BORRADOR → los borra (path-sistema) y recrea', async () => {
      const previos = [
        { id: 'old-1', origenTipo: 'CIERRE_GASTOS', estado: EstadoComprobante.BORRADOR },
        { id: 'old-2', origenTipo: 'CIERRE_INGRESOS', estado: EstadoComprobante.BORRADOR },
        { id: 'old-3', origenTipo: 'CIERRE_RESULTADO', estado: EstadoComprobante.BORRADOR },
      ];
      const { service, mocks } = buildService({
        gestion: gestionLista({ comprobantesDeCierre: previos }),
      });

      await service.generarCierre(GESTION, TENANT, USER);

      expect(mocks.writer.eliminarBorradorSistema).toHaveBeenCalledTimes(3);
      const borrados = mocks.writer.eliminarBorradorSistema.mock.calls.map(([id]) => id);
      expect(borrados).toEqual(expect.arrayContaining(['old-1', 'old-2', 'old-3']));
      expect(mocks.writer.crearBorradorSistema).toHaveBeenCalledTimes(3);
    });

    it('algún cierre previo CONTABILIZADO → CierreYaParcialmenteContabilizadoError', async () => {
      const previos = [
        { id: 'old-1', origenTipo: 'CIERRE_GASTOS', estado: EstadoComprobante.CONTABILIZADO },
        { id: 'old-2', origenTipo: 'CIERRE_INGRESOS', estado: EstadoComprobante.BORRADOR },
      ];
      const { service, mocks } = buildService({
        gestion: gestionLista({ comprobantesDeCierre: previos }),
      });

      await expect(service.generarCierre(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
        CierreYaParcialmenteContabilizadoError,
      );
      expect(mocks.writer.eliminarBorradorSistema).not.toHaveBeenCalled();
      expect(mocks.writer.crearBorradorSistema).not.toHaveBeenCalled();
    });
  });

  describe('generarCierre — fecha del asiento por tipo de empresa', () => {
    it('comercial mesCierre=12 → 2026-12-31', async () => {
      const { service, mocks } = buildService();
      await service.generarCierre(GESTION, TENANT, USER);
      const [data] = mocks.writer.crearBorradorSistema.mock.calls[0]!;
      expect(data.fechaContable).toEqual(new Date(Date.UTC(2026, 11, 31)));
    });

    it('agropecuaria mesCierre=6 → 2026-06-30', async () => {
      const { service, mocks } = buildService({
        config: { ...configDefault(), tipoEmpresaPrincipal: TipoEmpresa.AGROPECUARIA },
        gestion: gestionLista({
          periodoMesCierre: {
            id: 'periodo-jun',
            year: 2026,
            month: 6,
            estaAbierto: true,
            fechaCierre: new Date(Date.UTC(2026, 5, 30)),
          },
        }),
      });
      await service.generarCierre(GESTION, TENANT, USER);
      const [data] = mocks.writer.crearBorradorSistema.mock.calls[0]!;
      expect(data.fechaContable).toEqual(new Date(Date.UTC(2026, 5, 30)));
    });
  });

  describe('generarCierre — caso pérdida', () => {
    it('pérdida: #3 traslada con RA al DEBE y transitoria al HABER', async () => {
      const { service, mocks } = buildService({ saldos: saldosPerdida() });
      await service.generarCierre(GESTION, TENANT, USER);

      const traslado = mocks.writer.crearBorradorSistema.mock.calls.find(
        ([d]) => d.origenTipo === 'CIERRE_RESULTADO',
      )![0];
      const ra = traslado.lineas.find((l) => l.cuentaId === ACUMULADOS)!;
      const transit = traslado.lineas.find((l) => l.cuentaId === TRANSITORIA)!;
      expect(ra.debito.toString()).toBe('20000');
      expect(transit.credito.toString()).toBe('20000');
    });
  });

  describe('obtenerEstadoCierre (preview)', () => {
    it('devuelve los comprobantes existentes sin generar', async () => {
      const previos = [
        { id: 'c-1', origenTipo: 'CIERRE_GASTOS', estado: EstadoComprobante.BORRADOR },
      ];
      const { service, mocks } = buildService({
        gestion: gestionLista({ comprobantesDeCierre: previos }),
      });

      const estado = await service.obtenerEstadoCierre(GESTION, TENANT);

      expect(estado.cierres).toHaveLength(1);
      expect(estado.cierres[0]!.id).toBe('c-1');
      expect(mocks.writer.crearBorradorSistema).not.toHaveBeenCalled();
    });

    it('gestión no encontrada → CierreGestionNoEncontradaError', async () => {
      const { service } = buildService({ gestion: null });
      await expect(service.obtenerEstadoCierre(GESTION, TENANT)).rejects.toBeInstanceOf(
        CierreGestionNoEncontradaError,
      );
    });
  });
});
