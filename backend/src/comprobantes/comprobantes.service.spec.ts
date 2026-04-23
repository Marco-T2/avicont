import {
  EstadoComprobante,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  TipoComprobante,
} from '@prisma/client';

import type { ClockPort } from '@/common/clock/clock.port';
import type { PrismaService } from '@/common/prisma.service';
import type { CuentaParaLinea, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import { ComprobantesService } from './comprobantes.service';
import type {
  ComprobanteConLineas,
  ComprobanteRepositoryPort,
} from './ports/comprobante.repository.port';

// ============================================================
// Fixtures y mocks
// ============================================================

const TENANT_ID = 'org-1';
const USER_ID = 'user-1';
const PERIODO_ID = 'periodo-1';
const CUENTA_CAJA_ID = 'cuenta-caja';
const CUENTA_VENTAS_ID = 'cuenta-ventas';
const CUENTA_IVA_ID = 'cuenta-iva';

type MockRepo = { [K in keyof ComprobanteRepositoryPort]: jest.Mock };
type MockPeriodos = { [K in keyof PeriodosReaderPort]: jest.Mock };
type MockCuentas = { [K in keyof CuentasReaderPort]: jest.Mock };
type MockClock = { [K in keyof ClockPort]: jest.Mock };

function makeRepoMock(): MockRepo {
  return {
    crearBorrador: jest.fn(),
    findById: jest.fn(),
    reemplazarBorrador: jest.fn(),
    eliminarBorrador: jest.fn(),
    listar: jest.fn(),
    registrarAuditoria: jest.fn(),
  };
}

function makePeriodosMock(): MockPeriodos {
  return { obtenerPorFecha: jest.fn() };
}

function makeCuentasMock(): MockCuentas {
  return { obtenerBatch: jest.fn() };
}

function makeClockMock(hoyIso = '2026-04-22'): MockClock {
  return {
    now: jest.fn(() => new Date(`${hoyIso}T12:00:00Z`)),
    currentYearLaPaz: jest.fn(() => Number(hoyIso.slice(0, 4))),
    currentDateLaPaz: jest.fn(() => hoyIso),
  };
}

function makePrismaMock(): PrismaService {
  return {
    $transaction: jest.fn(async (cb: (tx: Prisma.TransactionClient) => unknown) =>
      cb({} as Prisma.TransactionClient),
    ),
  } as unknown as PrismaService;
}

function cuentaFactory(overrides: Partial<CuentaParaLinea>): CuentaParaLinea {
  return {
    id: CUENTA_CAJA_ID,
    codigoInterno: '1.1.1.001',
    nombre: 'Caja',
    activa: true,
    esDetalle: true,
    requiereContacto: false,
    permiteMultiMoneda: true,
    monedaFuncional: Moneda.BOB,
    ...overrides,
  };
}

function comprobanteFactory(overrides: Partial<ComprobanteConLineas> = {}): ComprobanteConLineas {
  const base = {
    id: 'comp-1',
    organizationId: TENANT_ID,
    tipo: TipoComprobante.DIARIO,
    numero: null,
    estado: EstadoComprobante.BORRADOR,
    fechaContable: new Date(Date.UTC(2026, 3, 22)),
    periodoFiscalId: PERIODO_ID,
    glosa: 'Venta al contado',
    monedaPrincipal: Moneda.BOB,
    totalDebitoBob: new Prisma.Decimal(0),
    totalCreditoBob: new Prisma.Decimal(0),
    origenTipo: null,
    origenId: null,
    anulaAId: null,
    anuladoEn: null,
    anuladoPorUserId: null,
    motivoAnulacion: null,
    createdAt: new Date('2026-04-22T10:00:00Z'),
    createdByUserId: USER_ID,
    updatedAt: new Date('2026-04-22T10:00:00Z'),
    lineas: [],
  } as unknown as ComprobanteConLineas;
  return { ...base, ...overrides };
}

function dtoCreateDiarioBOB() {
  return {
    tipo: TipoComprobante.DIARIO,
    fechaContable: '2026-04-22',
    glosa: 'Venta al contado a cliente X',
    monedaPrincipal: Moneda.BOB,
    lineas: [
      {
        cuentaId: CUENTA_CAJA_ID,
        moneda: Moneda.BOB,
        debito: '1000.00',
        credito: '0',
        tipoCambio: '1',
        debitoBob: '1000.00',
        creditoBob: '0',
      },
      {
        cuentaId: CUENTA_VENTAS_ID,
        moneda: Moneda.BOB,
        debito: '0',
        credito: '1000.00',
        tipoCambio: '1',
        debitoBob: '0',
        creditoBob: '1000.00',
      },
    ],
  };
}

// ============================================================
// Setup del service
// ============================================================

function buildService(overrides?: {
  repo?: Partial<MockRepo>;
  periodos?: Partial<MockPeriodos>;
  cuentas?: Partial<MockCuentas>;
  clock?: Partial<MockClock>;
}) {
  const repo = { ...makeRepoMock(), ...(overrides?.repo ?? {}) };
  const periodos = { ...makePeriodosMock(), ...(overrides?.periodos ?? {}) };
  const cuentas = { ...makeCuentasMock(), ...(overrides?.cuentas ?? {}) };
  const clock = { ...makeClockMock(), ...(overrides?.clock ?? {}) };
  const prisma = makePrismaMock();

  const service = new ComprobantesService(
    repo as unknown as ComprobanteRepositoryPort,
    periodos as unknown as PeriodosReaderPort,
    cuentas as unknown as CuentasReaderPort,
    clock as unknown as ClockPort,
    prisma,
  );
  return { service, repo, periodos, cuentas, clock, prisma };
}

function makeCuentasMap(): Map<string, CuentaParaLinea> {
  return new Map([
    [CUENTA_CAJA_ID, cuentaFactory({ id: CUENTA_CAJA_ID, codigoInterno: '1.1.1.001' })],
    [CUENTA_VENTAS_ID, cuentaFactory({ id: CUENTA_VENTAS_ID, codigoInterno: '4.1.1.001' })],
    [CUENTA_IVA_ID, cuentaFactory({ id: CUENTA_IVA_ID, codigoInterno: '2.1.4.001' })],
  ]);
}

// ============================================================
// Tests
// ============================================================

describe('ComprobantesService', () => {
  describe('crearBorrador', () => {
    it('crea un borrador BOB con 2 líneas balanceadas', async () => {
      const dto = dtoCreateDiarioBOB();
      const { service, repo, periodos, cuentas } = buildService();

      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      repo.crearBorrador.mockResolvedValue(
        comprobanteFactory({
          id: 'comp-new',
          lineas: [
            {
              id: 'l-1',
              organizationId: TENANT_ID,
              comprobanteId: 'comp-new',
              orden: 1,
              cuentaId: CUENTA_CAJA_ID,
              contactoId: null,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('1000'),
              credito: new Prisma.Decimal(0),
              tipoCambio: new Prisma.Decimal(1),
              debitoBob: new Prisma.Decimal('1000'),
              creditoBob: new Prisma.Decimal(0),
              glosaLinea: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      );

      const result = await service.crearBorrador(TENANT_ID, USER_ID, dto);

      expect(result.id).toBe('comp-new');
      expect(periodos.obtenerPorFecha).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ year: 2026, month: 4, day: 22 }),
        expect.any(Object),
      );
      expect(cuentas.obtenerBatch).toHaveBeenCalledWith(
        TENANT_ID,
        [CUENTA_CAJA_ID, CUENTA_VENTAS_ID],
        expect.any(Object),
      );
      expect(repo.crearBorrador).toHaveBeenCalledTimes(1);
      expect(repo.registrarAuditoria).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          accion: 'CREADO',
          userId: USER_ID,
        }),
        expect.any(Object),
      );
    });

    it('rechaza fechaContable futura con FechaFuturaNoPermitidaError', async () => {
      const { service, periodos } = buildService({
        clock: { currentDateLaPaz: jest.fn(() => '2026-04-22') },
      });
      const dto = { ...dtoCreateDiarioBOB(), fechaContable: '2026-04-23' };

      await expect(service.crearBorrador(TENANT_ID, USER_ID, dto)).rejects.toMatchObject({
        code: 'COMPROBANTE_FECHA_FUTURA_NO_PERMITIDA',
      });
      expect(periodos.obtenerPorFecha).not.toHaveBeenCalled();
    });

    it('rechaza con GestionNoAbierta si no hay período para la fecha', async () => {
      const { service, periodos } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue(null);

      await expect(
        service.crearBorrador(TENANT_ID, USER_ID, dtoCreateDiarioBOB()),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_GESTION_NO_ABIERTA',
      });
    });

    it('rechaza con PeriodoNoAbierto si el período está CERRADO', async () => {
      const { service, periodos } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(
        service.crearBorrador(TENANT_ID, USER_ID, dtoCreateDiarioBOB()),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_PERIODO_NO_ABIERTO',
      });
    });

    it('rechaza CuentaNoEncontrada si una cuenta referenciada no está en el batch', async () => {
      const { service, periodos, cuentas } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(new Map()); // batch vacío

      await expect(
        service.crearBorrador(TENANT_ID, USER_ID, dtoCreateDiarioBOB()),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_CUENTA_NO_ENCONTRADA',
      });
    });

    it('rechaza CuentaInactiva', async () => {
      const { service, periodos, cuentas } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      const map = makeCuentasMap();
      map.set(CUENTA_CAJA_ID, cuentaFactory({ id: CUENTA_CAJA_ID, activa: false }));
      cuentas.obtenerBatch.mockResolvedValue(map);

      await expect(
        service.crearBorrador(TENANT_ID, USER_ID, dtoCreateDiarioBOB()),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_CUENTA_INACTIVA',
      });
    });

    it('rechaza CuentaNoDetalle', async () => {
      const { service, periodos, cuentas } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      const map = makeCuentasMap();
      map.set(CUENTA_VENTAS_ID, cuentaFactory({ id: CUENTA_VENTAS_ID, esDetalle: false }));
      cuentas.obtenerBatch.mockResolvedValue(map);

      await expect(
        service.crearBorrador(TENANT_ID, USER_ID, dtoCreateDiarioBOB()),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_CUENTA_NO_DETALLE',
      });
    });

    it('rechaza MonedaIncompatibleCuenta', async () => {
      const { service, periodos, cuentas } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      const map = makeCuentasMap();
      map.set(
        CUENTA_CAJA_ID,
        cuentaFactory({
          id: CUENTA_CAJA_ID,
          permiteMultiMoneda: false,
          monedaFuncional: Moneda.USD,
        }),
      );
      cuentas.obtenerBatch.mockResolvedValue(map);

      await expect(
        service.crearBorrador(TENANT_ID, USER_ID, dtoCreateDiarioBOB()),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_MONEDA_INCOMPATIBLE_CUENTA',
      });
    });

    it('rechaza línea con débito y crédito simultáneos', async () => {
      const { service, periodos, cuentas } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());

      const dto = dtoCreateDiarioBOB();
      dto.lineas[0] = {
        ...dto.lineas[0]!,
        debito: '500.00',
        credito: '500.00',
        debitoBob: '500.00',
        creditoBob: '500.00',
      };

      await expect(service.crearBorrador(TENANT_ID, USER_ID, dto)).rejects.toMatchObject({
        code: 'COMPROBANTE_LINEA_AMBIGUA_DEBITO_CREDITO',
      });
    });

    it('rechaza montoBob incoherente con monto × tipoCambio', async () => {
      const { service, periodos, cuentas } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());

      const dto = dtoCreateDiarioBOB();
      dto.lineas[0] = {
        ...dto.lineas[0]!,
        debito: '100.00',
        debitoBob: '500.00', // debería ser 100 con tipoCambio=1
      };

      await expect(service.crearBorrador(TENANT_ID, USER_ID, dto)).rejects.toMatchObject({
        code: 'COMPROBANTE_MONTO_BOB_INCOHERENTE',
      });
    });

    it('rechaza moneda=BOB con tipoCambio ≠ 1', async () => {
      const { service, periodos, cuentas } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());

      const dto = dtoCreateDiarioBOB();
      dto.lineas[0] = { ...dto.lineas[0]!, tipoCambio: '6.96' };

      await expect(service.crearBorrador(TENANT_ID, USER_ID, dto)).rejects.toMatchObject({
        code: 'COMPROBANTE_TIPO_CAMBIO_INVALIDO',
      });
    });

    it('tolera línea desbalanceada en BORRADOR (sin enforce de partida doble todavía)', async () => {
      const { service, periodos, cuentas, repo } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      repo.crearBorrador.mockResolvedValue(comprobanteFactory({ id: 'comp-x' }));

      const dto = dtoCreateDiarioBOB();
      // Débito 1000, crédito 500 — desbalanceado, pero es borrador.
      dto.lineas[1] = {
        ...dto.lineas[1]!,
        credito: '500.00',
        creditoBob: '500.00',
      };

      await expect(service.crearBorrador(TENANT_ID, USER_ID, dto)).resolves.toMatchObject({
        id: 'comp-x',
      });
    });
  });

  describe('obtener', () => {
    it('devuelve el comprobante si existe', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ id: 'comp-1' }));

      const r = await service.obtener(TENANT_ID, 'comp-1');

      expect(r.id).toBe('comp-1');
      expect(repo.findById).toHaveBeenCalledWith(TENANT_ID, 'comp-1');
    });

    it('lanza ComprobanteNoEncontradoError si no existe', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(null);

      await expect(service.obtener(TENANT_ID, 'comp-x')).rejects.toMatchObject({
        code: 'COMPROBANTE_NO_ENCONTRADO',
      });
    });
  });

  describe('eliminarBorrador', () => {
    it('elimina un BORRADOR', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ estado: EstadoComprobante.BORRADOR }));
      repo.eliminarBorrador.mockResolvedValue(1);

      await expect(service.eliminarBorrador(TENANT_ID, 'comp-1')).resolves.toBeUndefined();
      expect(repo.eliminarBorrador).toHaveBeenCalledWith(TENANT_ID, 'comp-1');
    });

    it('rechaza eliminar un CONTABILIZADO', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ estado: EstadoComprobante.CONTABILIZADO }),
      );

      await expect(service.eliminarBorrador(TENANT_ID, 'comp-1')).rejects.toMatchObject({
        code: 'COMPROBANTE_ESTADO_INVALIDO',
      });
      expect(repo.eliminarBorrador).not.toHaveBeenCalled();
    });

    it('lanza 404 si no existe', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(null);

      await expect(service.eliminarBorrador(TENANT_ID, 'comp-x')).rejects.toMatchObject({
        code: 'COMPROBANTE_NO_ENCONTRADO',
      });
    });
  });

  describe('actualizarBorrador', () => {
    it('actualiza un BORRADOR modificando glosa', async () => {
      const { service, repo, periodos, cuentas } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({
          estado: EstadoComprobante.BORRADOR,
          lineas: [
            {
              id: 'l-1',
              organizationId: TENANT_ID,
              comprobanteId: 'comp-1',
              orden: 1,
              cuentaId: CUENTA_CAJA_ID,
              contactoId: null,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('1000'),
              credito: new Prisma.Decimal(0),
              tipoCambio: new Prisma.Decimal(1),
              debitoBob: new Prisma.Decimal('1000'),
              creditoBob: new Prisma.Decimal(0),
              glosaLinea: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: 'l-2',
              organizationId: TENANT_ID,
              comprobanteId: 'comp-1',
              orden: 2,
              cuentaId: CUENTA_VENTAS_ID,
              contactoId: null,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal(0),
              credito: new Prisma.Decimal('1000'),
              tipoCambio: new Prisma.Decimal(1),
              debitoBob: new Prisma.Decimal(0),
              creditoBob: new Prisma.Decimal('1000'),
              glosaLinea: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      );
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      repo.reemplazarBorrador.mockResolvedValue(comprobanteFactory({ glosa: 'Glosa actualizada' }));

      const r = await service.actualizarBorrador(TENANT_ID, USER_ID, 'comp-1', {
        glosa: 'Glosa actualizada',
      });

      expect(r.glosa).toBe('Glosa actualizada');
      expect(repo.reemplazarBorrador).toHaveBeenCalledTimes(1);
      expect(repo.registrarAuditoria).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ accion: 'EDITADO' }),
        expect.any(Object),
      );
    });

    it('rechaza actualizar un CONTABILIZADO', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ estado: EstadoComprobante.CONTABILIZADO }),
      );

      await expect(
        service.actualizarBorrador(TENANT_ID, USER_ID, 'comp-1', { glosa: 'x' }),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_ESTADO_INVALIDO' });
      expect(repo.reemplazarBorrador).not.toHaveBeenCalled();
    });
  });

  describe('listar', () => {
    it('pasa filtros y paginación al repo', async () => {
      const { service, repo } = buildService();
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, {
        tipo: TipoComprobante.INGRESO,
        fechaDesde: '2026-04-01',
        fechaHasta: '2026-04-30',
        page: 2,
        limit: 100,
      });

      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          tipo: TipoComprobante.INGRESO,
          fechaDesde: expect.any(Date),
          fechaHasta: expect.any(Date),
        }),
        { page: 2, limit: 100 },
      );
    });

    it('aplica defaults de page=1 y limit=50', async () => {
      const { service, repo } = buildService();
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, {});

      expect(repo.listar).toHaveBeenCalledWith(TENANT_ID, expect.any(Object), {
        page: 1,
        limit: 50,
      });
    });
  });
});
