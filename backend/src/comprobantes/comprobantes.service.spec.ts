import {
  EstadoComprobante,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  TipoComprobante,
} from '@prisma/client';

import type { ClockPort } from '@/common/clock/clock.port';
import type { PrismaService } from '@/common/prisma.service';
import type { ContactosReaderPort } from '@/contactos/ports/contactos-reader.port';
import type { CuentaParaLinea, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import { ComprobantesService } from './comprobantes.service';
import type {
  ComprobanteConLineas,
  ComprobanteRepositoryPort,
} from './ports/comprobante.repository.port';
import type { SecuenciaComprobantePort } from './ports/secuencia-comprobante.port';

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
type MockContactos = { [K in keyof ContactosReaderPort]: jest.Mock };
type MockClock = { [K in keyof ClockPort]: jest.Mock };
type MockSecuencia = { [K in keyof SecuenciaComprobantePort]: jest.Mock };

function makeRepoMock(): MockRepo {
  return {
    crearBorrador: jest.fn(),
    findById: jest.fn(),
    reemplazarBorrador: jest.fn(),
    contabilizar: jest.fn(),
    crearReversion: jest.fn(),
    marcarAnulado: jest.fn(),
    eliminarBorrador: jest.fn(),
    listar: jest.fn(),
    registrarAuditoria: jest.fn(),
    listarAuditoria: jest.fn(),
  };
}

function makeSecuenciaMock(): MockSecuencia {
  return { siguienteCorrelativo: jest.fn() };
}

function makePeriodosMock(): MockPeriodos {
  return { obtenerPorFecha: jest.fn() };
}

function makeCuentasMock(): MockCuentas {
  return { obtenerBatch: jest.fn() };
}

// Default: Map vacío. Los tests sin contactoId ni siquiera consultan; los
// tests que usan contactoId deben sobrescribir con .mockResolvedValue(...).
function makeContactosMock(): MockContactos {
  const fn = jest.fn();
  fn.mockResolvedValue(new Map());
  return { obtenerBatch: fn };
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
  contactos?: Partial<MockContactos>;
  clock?: Partial<MockClock>;
  secuencia?: Partial<MockSecuencia>;
}) {
  const repo = { ...makeRepoMock(), ...(overrides?.repo ?? {}) };
  const periodos = { ...makePeriodosMock(), ...(overrides?.periodos ?? {}) };
  const cuentas = { ...makeCuentasMock(), ...(overrides?.cuentas ?? {}) };
  const contactos = { ...makeContactosMock(), ...(overrides?.contactos ?? {}) };
  const clock = { ...makeClockMock(), ...(overrides?.clock ?? {}) };
  const secuencia = { ...makeSecuenciaMock(), ...(overrides?.secuencia ?? {}) };
  const prisma = makePrismaMock();

  const service = new ComprobantesService(
    repo as unknown as ComprobanteRepositoryPort,
    periodos as unknown as PeriodosReaderPort,
    cuentas as unknown as CuentasReaderPort,
    contactos as unknown as ContactosReaderPort,
    clock as unknown as ClockPort,
    secuencia as unknown as SecuenciaComprobantePort,
    prisma,
  );
  return { service, repo, periodos, cuentas, contactos, clock, secuencia, prisma };
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

    it('rechaza si una línea referencia un contactoId que no existe', async () => {
      const { service, repo, periodos, cuentas, contactos } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      // Contacto inexistente: Map vacío.
      contactos.obtenerBatch.mockResolvedValue(new Map());

      const dto = dtoCreateDiarioBOB();
      const missingId = '11111111-1111-4111-a111-111111111111';
      (dto.lineas[0] as Record<string, unknown>).contactoId = missingId;

      await expect(service.crearBorrador(TENANT_ID, USER_ID, dto)).rejects.toMatchObject({
        code: 'COMPROBANTE_CONTACTO_NO_EXISTE',
        details: { orden: 1, contactoId: missingId },
      });
      expect(repo.crearBorrador).not.toHaveBeenCalled();
    });

    it('acepta una línea con contactoId existente (independiente de activo)', async () => {
      const { service, repo, periodos, cuentas, contactos } = buildService();
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      const contactoId = '11111111-1111-4111-a111-11111111aaaa';
      // Contacto inactivo — se permite en BORRADOR; se bloquea al contabilizar.
      contactos.obtenerBatch.mockResolvedValue(
        new Map([[contactoId, { id: contactoId, activo: false }]]),
      );
      repo.crearBorrador.mockResolvedValue(comprobanteFactory({ id: 'comp-ok' }));

      const dto = dtoCreateDiarioBOB();
      (dto.lineas[0] as Record<string, unknown>).contactoId = contactoId;

      await expect(service.crearBorrador(TENANT_ID, USER_ID, dto)).resolves.toMatchObject({
        id: 'comp-ok',
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

  describe('contabilizar', () => {
    function borradorBalanceadoFactory(): ComprobanteConLineas {
      return comprobanteFactory({
        id: 'comp-b',
        estado: EstadoComprobante.BORRADOR,
        lineas: [
          {
            id: 'l-1',
            organizationId: TENANT_ID,
            comprobanteId: 'comp-b',
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
            comprobanteId: 'comp-b',
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
      });
    }

    function setupHappyPath() {
      const ctx = buildService();
      ctx.repo.findById.mockResolvedValue(borradorBalanceadoFactory());
      ctx.periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      ctx.cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      ctx.secuencia.siguienteCorrelativo.mockResolvedValue(42);
      ctx.repo.contabilizar.mockImplementation(async (_t, _id, data) =>
        comprobanteFactory({
          id: 'comp-b',
          estado: EstadoComprobante.CONTABILIZADO,
          numero: data.numero,
          totalDebitoBob: data.totalDebitoBob,
          totalCreditoBob: data.totalCreditoBob,
        }),
      );
      return ctx;
    }

    it('contabiliza un BORRADOR balanceado asignando número atómico', async () => {
      const { service, repo, secuencia } = setupHappyPath();

      const r = await service.contabilizar(TENANT_ID, USER_ID, 'comp-b');

      expect(secuencia.siguienteCorrelativo).toHaveBeenCalledWith(
        TENANT_ID,
        TipoComprobante.DIARIO,
        2026,
        4,
        expect.any(Object),
      );
      expect(repo.contabilizar).toHaveBeenCalledWith(
        TENANT_ID,
        'comp-b',
        expect.objectContaining({
          numero: 'D2604-000042',
          totalDebitoBob: expect.anything(),
          totalCreditoBob: expect.anything(),
        }),
        expect.any(Object),
      );
      expect(repo.registrarAuditoria).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ accion: 'CONTABILIZADO' }),
        expect.any(Object),
      );
      expect(r.numero).toBe('D2604-000042');
      expect(r.estado).toBe(EstadoComprobante.CONTABILIZADO);
    });

    it('rechaza contabilizar un CONTABILIZADO', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(
        borradorBalanceadoFactory() &&
          comprobanteFactory({ estado: EstadoComprobante.CONTABILIZADO }),
      );

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-1')).rejects.toMatchObject({
        code: 'COMPROBANTE_ESTADO_INVALIDO',
      });
    });

    it('lanza 404 si el comprobante no existe', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(null);

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-x')).rejects.toMatchObject({
        code: 'COMPROBANTE_NO_ENCONTRADO',
      });
    });

    it('rechaza si el período se cerró entre create y contabilizar', async () => {
      const { service, repo, periodos, secuencia } = buildService();
      repo.findById.mockResolvedValue(borradorBalanceadoFactory());
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).rejects.toMatchObject({
        code: 'COMPROBANTE_PERIODO_NO_ABIERTO',
      });
      expect(secuencia.siguienteCorrelativo).not.toHaveBeenCalled();
    });

    it('rechaza si una cuenta fue desactivada después del create', async () => {
      const { service, repo, periodos, cuentas, secuencia } = buildService();
      repo.findById.mockResolvedValue(borradorBalanceadoFactory());
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      const map = makeCuentasMap();
      map.set(CUENTA_CAJA_ID, cuentaFactory({ id: CUENTA_CAJA_ID, activa: false }));
      cuentas.obtenerBatch.mockResolvedValue(map);

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).rejects.toMatchObject({
        code: 'COMPROBANTE_CUENTA_INACTIVA',
      });
      expect(secuencia.siguienteCorrelativo).not.toHaveBeenCalled();
    });

    it('rechaza si una cuenta requiere contacto y la línea no lo trae', async () => {
      const { service, repo, periodos, cuentas } = buildService();
      repo.findById.mockResolvedValue(borradorBalanceadoFactory());
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      const map = makeCuentasMap();
      map.set(CUENTA_CAJA_ID, cuentaFactory({ id: CUENTA_CAJA_ID, requiereContacto: true }));
      cuentas.obtenerBatch.mockResolvedValue(map);

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).rejects.toMatchObject({
        code: 'COMPROBANTE_CONTACTO_REQUERIDO',
      });
    });

    it('rechaza partida doble desbalanceada (más allá de ±0.01)', async () => {
      const { service, repo, periodos, cuentas, secuencia } = buildService();
      const borrador = borradorBalanceadoFactory();
      // Rompemos el balance: débito 1000, crédito 500.
      borrador.lineas[1]!.credito = new Prisma.Decimal('500');
      borrador.lineas[1]!.creditoBob = new Prisma.Decimal('500');
      repo.findById.mockResolvedValue(borrador);
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).rejects.toMatchObject({
        code: 'COMPROBANTE_DESBALANCEADO',
      });
      expect(secuencia.siguienteCorrelativo).not.toHaveBeenCalled();
    });

    it('rechaza contabilizar con solo 1 línea', async () => {
      const { service, repo, periodos, cuentas } = buildService();
      const borrador = borradorBalanceadoFactory();
      borrador.lineas = [borrador.lineas[0]!];
      repo.findById.mockResolvedValue(borrador);
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).rejects.toMatchObject({
        code: 'COMPROBANTE_SIN_LINEAS',
      });
    });

    it('genera número con prefijo correcto según el tipo', async () => {
      const { service, repo, periodos, cuentas, secuencia } = setupHappyPath();
      const borrador = borradorBalanceadoFactory();
      borrador.tipo = TipoComprobante.INGRESO;
      repo.findById.mockResolvedValue(borrador);
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      secuencia.siguienteCorrelativo.mockResolvedValue(7);

      const r = await service.contabilizar(TENANT_ID, USER_ID, 'comp-b');

      expect(r.numero).toBe('I2604-000007');
    });

    it('rechaza al contabilizar si un contacto referenciado fue desactivado entre medio', async () => {
      const contactoId = '11111111-1111-4111-a111-11111111aaaa';
      const borrador = borradorBalanceadoFactory();
      borrador.lineas[0]!.contactoId = contactoId;

      const { service, repo, periodos, cuentas, contactos } = buildService();
      repo.findById.mockResolvedValue(borrador);
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      contactos.obtenerBatch.mockResolvedValue(
        new Map([[contactoId, { id: contactoId, activo: false }]]),
      );

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).rejects.toMatchObject({
        code: 'COMPROBANTE_CONTACTO_INACTIVO',
        details: { orden: 1, contactoId },
      });
      expect(repo.contabilizar).not.toHaveBeenCalled();
    });

    it('rechaza al contabilizar si contactoId referenciado no existe (defense in depth)', async () => {
      const contactoId = '11111111-1111-4111-a111-11111111bbbb';
      const borrador = borradorBalanceadoFactory();
      borrador.lineas[0]!.contactoId = contactoId;

      const { service, repo, periodos, cuentas, contactos } = buildService();
      repo.findById.mockResolvedValue(borrador);
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      contactos.obtenerBatch.mockResolvedValue(new Map());

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).rejects.toMatchObject({
        code: 'COMPROBANTE_CONTACTO_NO_EXISTE',
        details: { orden: 1, contactoId },
      });
      expect(repo.contabilizar).not.toHaveBeenCalled();
    });

    it('contabiliza OK si el contacto referenciado está activo', async () => {
      const contactoId = '11111111-1111-4111-a111-11111111cccc';
      const borrador = borradorBalanceadoFactory();
      borrador.lineas[0]!.contactoId = contactoId;

      const { service, repo, periodos, cuentas, contactos, secuencia } = buildService();
      repo.findById.mockResolvedValue(borrador);
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      cuentas.obtenerBatch.mockResolvedValue(makeCuentasMap());
      contactos.obtenerBatch.mockResolvedValue(
        new Map([[contactoId, { id: contactoId, activo: true }]]),
      );
      secuencia.siguienteCorrelativo.mockResolvedValue(99);
      repo.contabilizar.mockImplementation(async (_t, _id, data) =>
        comprobanteFactory({
          id: 'comp-b',
          estado: EstadoComprobante.CONTABILIZADO,
          numero: data.numero,
          totalDebitoBob: data.totalDebitoBob,
          totalCreditoBob: data.totalCreditoBob,
        }),
      );

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).resolves.toMatchObject({
        estado: EstadoComprobante.CONTABILIZADO,
      });
    });
  });

  describe('anular', () => {
    function originalContabilizadoFactory(): ComprobanteConLineas {
      return comprobanteFactory({
        id: 'comp-orig',
        tipo: TipoComprobante.DIARIO,
        numero: 'D2604-000042',
        estado: EstadoComprobante.CONTABILIZADO,
        totalDebitoBob: new Prisma.Decimal('1000'),
        totalCreditoBob: new Prisma.Decimal('1000'),
        lineas: [
          {
            id: 'l-1',
            organizationId: TENANT_ID,
            comprobanteId: 'comp-orig',
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
            comprobanteId: 'comp-orig',
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
      });
    }

    function setupAnularHappy() {
      const ctx = buildService();
      ctx.repo.findById.mockResolvedValue(originalContabilizadoFactory());
      ctx.periodos.obtenerPorFecha.mockResolvedValue({
        id: 'periodo-actual',
        status: PeriodoFiscalStatus.ABIERTO,
      });
      ctx.secuencia.siguienteCorrelativo.mockResolvedValue(7);
      ctx.repo.crearReversion.mockImplementation(async (_t, data) =>
        comprobanteFactory({
          id: 'comp-rev',
          tipo: data.tipo,
          numero: data.numero,
          estado: EstadoComprobante.CONTABILIZADO,
          glosa: data.glosa,
          anulaAId: data.anulaAId,
          totalDebitoBob: data.totalDebitoBob,
          totalCreditoBob: data.totalCreditoBob,
        }),
      );
      ctx.repo.marcarAnulado.mockImplementation(async (_t, id, metadata) =>
        comprobanteFactory({
          id,
          estado: EstadoComprobante.ANULADO,
          anuladoEn: metadata.anuladoEn,
          anuladoPorUserId: metadata.anuladoPorUserId,
          motivoAnulacion: metadata.motivoAnulacion,
        }),
      );
      return ctx;
    }

    it('crea reversión AJUSTE con líneas invertidas + marca original ANULADO', async () => {
      const { service, repo, secuencia } = setupAnularHappy();

      const r = await service.anular(
        TENANT_ID,
        USER_ID,
        'comp-orig',
        'Error en la imputación al cliente',
      );

      // Reversión: tipo AJUSTE, prefijo J, totales invertidos, FK al original.
      expect(secuencia.siguienteCorrelativo).toHaveBeenCalledWith(
        TENANT_ID,
        TipoComprobante.AJUSTE,
        2026,
        4,
        expect.any(Object),
      );
      expect(repo.crearReversion).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          tipo: TipoComprobante.AJUSTE,
          numero: 'J2604-000007',
          anulaAId: 'comp-orig',
          glosa: expect.stringContaining('Reversión de D2604-000042'),
          lineas: expect.arrayContaining([
            expect.objectContaining({
              orden: 1,
              // La línea 1 del original era débito 1000 → en reversión, crédito 1000.
              debito: expect.anything(),
              credito: expect.anything(),
            }),
          ]),
        }),
        expect.any(Object),
      );

      // Las líneas invertidas: debito/credito y BOB se cambian de lado.
      const call = repo.crearReversion.mock.calls[0]!;
      const data = call[1] as {
        lineas: Array<{
          debito: Prisma.Decimal | string;
          credito: Prisma.Decimal | string;
          debitoBob: Prisma.Decimal | string;
          creditoBob: Prisma.Decimal | string;
        }>;
      };
      const linea1 = data.lineas[0]!;
      const linea2 = data.lineas[1]!;
      expect(linea1.debito).toEqual(new Prisma.Decimal(0));
      expect(linea1.credito).toEqual(new Prisma.Decimal('1000'));
      expect(linea1.creditoBob).toEqual(new Prisma.Decimal('1000'));
      expect(linea2.debito).toEqual(new Prisma.Decimal('1000'));
      expect(linea2.credito).toEqual(new Prisma.Decimal(0));
      expect(linea2.debitoBob).toEqual(new Prisma.Decimal('1000'));

      // Original marcado ANULADO con metadata.
      expect(repo.marcarAnulado).toHaveBeenCalledWith(
        TENANT_ID,
        'comp-orig',
        expect.objectContaining({
          anuladoPorUserId: USER_ID,
          motivoAnulacion: 'Error en la imputación al cliente',
        }),
        expect.any(Object),
      );

      expect(r.reversion.numero).toBe('J2604-000007');
      expect(r.original.estado).toBe(EstadoComprobante.ANULADO);
    });

    it('audita ambos comprobantes (ANULADO + CREADO_POR_REVERSION)', async () => {
      const { service, repo } = setupAnularHappy();

      await service.anular(TENANT_ID, USER_ID, 'comp-orig', 'Motivo suficiente');

      const acciones = repo.registrarAuditoria.mock.calls.map((c) => {
        const data = c[1] as { accion: string };
        return data.accion;
      });
      expect(acciones).toEqual(expect.arrayContaining(['ANULADO', 'CREADO_POR_REVERSION']));
    });

    it('rechaza motivo vacío', async () => {
      const { service, repo } = buildService();

      await expect(service.anular(TENANT_ID, USER_ID, 'comp-orig', '')).rejects.toMatchObject({
        code: 'COMPROBANTE_MOTIVO_ANULACION_REQUERIDO',
      });
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('rechaza motivo con menos de 10 caracteres (incluye trim)', async () => {
      const { service } = buildService();

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-orig', '  corto  '),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_MOTIVO_ANULACION_REQUERIDO',
      });
    });

    it('lanza 404 si el comprobante no existe', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(null);

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-x', 'Motivo suficiente'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_NO_ENCONTRADO' });
    });

    it('rechaza anular un BLOQUEADO con ComprobanteBloqueadoError', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ estado: EstadoComprobante.BLOQUEADO }));

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-b', 'Motivo suficiente'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_BLOQUEADO' });
    });

    it('rechaza anular uno YA_ANULADO', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ estado: EstadoComprobante.ANULADO }));

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-a', 'Motivo suficiente'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_YA_ANULADO' });
    });

    it('rechaza anular un BORRADOR', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ estado: EstadoComprobante.BORRADOR }));

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-b', 'Motivo suficiente'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_ESTADO_INVALIDO' });
    });

    it('rechaza si hoy cae en período cerrado', async () => {
      const { service, repo, periodos, secuencia } = buildService();
      repo.findById.mockResolvedValue(originalContabilizadoFactory());
      periodos.obtenerPorFecha.mockResolvedValue({
        id: 'periodo-cerrado',
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-orig', 'Motivo suficiente'),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_PERIODO_REVERSION_NO_ABIERTO',
      });
      expect(secuencia.siguienteCorrelativo).not.toHaveBeenCalled();
    });

    it('rechaza si hoy no tiene período (gestión no creada para el año)', async () => {
      const { service, repo, periodos } = buildService();
      repo.findById.mockResolvedValue(originalContabilizadoFactory());
      periodos.obtenerPorFecha.mockResolvedValue(null);

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-orig', 'Motivo suficiente'),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_PERIODO_REVERSION_NO_ABIERTO',
      });
    });

    it('preserva el número del original (no lo reasigna)', async () => {
      const { service, repo } = setupAnularHappy();

      await service.anular(TENANT_ID, USER_ID, 'comp-orig', 'Motivo suficiente');

      // marcarAnulado NO recibe ningún cambio de número; el original mantiene el suyo.
      const call = repo.marcarAnulado.mock.calls[0]!;
      const metadata = call[2] as Record<string, unknown>;
      expect(metadata).not.toHaveProperty('numero');
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
