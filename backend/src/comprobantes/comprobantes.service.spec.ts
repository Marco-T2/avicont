import {
  type ComprobanteDocumentoFisico,
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
import type { DocumentoFisicoConRelaciones } from '@/documentos-fisicos/ports/documento-fisico.repository.port';
import type { AsociacionComprobanteRepositoryPort } from '@/documentos-fisicos/ports/asociacion-comprobante.repository.port';
import type {
  DocumentoFisicoParaAsociar,
  DocumentosFisicosReaderPort,
} from '@/documentos-fisicos/ports/documentos-fisicos-reader.port';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';
import type { RbacService } from '@/rbac/rbac.service';

import { AuditedTransactionRunner } from './infrastructure/audited-transaction.runner';
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
type MockDocsReader = { [K in keyof DocumentosFisicosReaderPort]: jest.Mock };
type MockAsociacionRepo = { [K in keyof AsociacionComprobanteRepositoryPort]: jest.Mock };
type MockRbac = Pick<RbacService, 'hasPermission'>;

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

function makeRbacMock(): { hasPermission: jest.Mock } {
  return {
    // Por default: usuario tiene todos los permisos. Los tests que verifican
    // rechazo por falta de permiso sobrescriben con mockResolvedValue(false).
    hasPermission: jest.fn().mockResolvedValue(true),
  };
}

function makeAuditedRunnerMock() {
  // El runner llama a fn(tx) y devuelve su resultado. Mockeamos la TX como
  // objeto vacío — el servicio no hace calls raw sobre ella en unit tests.
  const mockTx = {} as Prisma.TransactionClient;
  return {
    run: jest
      .fn()
      .mockImplementation(
        async (_opts: unknown, fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          fn(mockTx),
      ),
  };
}

function makeSecuenciaMock(): MockSecuencia {
  return { siguienteCorrelativo: jest.fn() };
}

function makeDocsReaderMock(): MockDocsReader {
  return {
    obtenerBatchParaAsociar: jest.fn(async () => new Map()),
    idsYaAsociadosAContabilizado: jest.fn(async () => []),
    listarAsociadosDeComprobante: jest.fn(async () => []),
  };
}

function makeAsociacionRepoMock(): MockAsociacionRepo {
  return {
    asociar: jest.fn(),
    desasociar: jest.fn(async () => 1),
    desasociarTodasDelComprobante: jest.fn(async () => 0),
    refrescarEstadoComprobante: jest.fn(async () => 0),
    listarPorComprobante: jest.fn(async () => []),
    listarPorDocumento: jest.fn(async () => []),
  };
}

function makePeriodosMock(): MockPeriodos {
  return {
    obtenerPorFecha: jest.fn(),
    obtenerReaperturaActiva: jest.fn().mockResolvedValue(null),
  };
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
    // Post-schema (comprobantes-anulacion-refactor): flag-based anulacion
    anulado: false,
    fechaAnulacion: null,
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
  docsReader?: Partial<MockDocsReader>;
  asociacionRepo?: Partial<MockAsociacionRepo>;
  rbac?: Partial<MockRbac>;
  auditedRunner?: ReturnType<typeof makeAuditedRunnerMock>;
}) {
  const repo = { ...makeRepoMock(), ...(overrides?.repo ?? {}) };
  const periodos = { ...makePeriodosMock(), ...(overrides?.periodos ?? {}) };
  const cuentas = { ...makeCuentasMock(), ...(overrides?.cuentas ?? {}) };
  const contactos = { ...makeContactosMock(), ...(overrides?.contactos ?? {}) };
  const clock = { ...makeClockMock(), ...(overrides?.clock ?? {}) };
  const secuencia = { ...makeSecuenciaMock(), ...(overrides?.secuencia ?? {}) };
  const docsReader = { ...makeDocsReaderMock(), ...(overrides?.docsReader ?? {}) };
  const asociacionRepo = { ...makeAsociacionRepoMock(), ...(overrides?.asociacionRepo ?? {}) };
  const rbac = { ...makeRbacMock(), ...(overrides?.rbac ?? {}) };
  const auditedRunner = overrides?.auditedRunner ?? makeAuditedRunnerMock();
  // prisma ya no se usa directamente en el servicio — todas las TX pasan por
  // auditedRunner. Lo mantenemos para los métodos legacy que aún llaman
  // this.prisma.$transaction (crearBorrador, actualizarBorrador, etc.) antes
  // de que task 5.5 los migre.
  const prisma = makePrismaMock();

  const service = new ComprobantesService(
    repo as unknown as ComprobanteRepositoryPort,
    periodos as unknown as PeriodosReaderPort,
    cuentas as unknown as CuentasReaderPort,
    contactos as unknown as ContactosReaderPort,
    clock as unknown as ClockPort,
    secuencia as unknown as SecuenciaComprobantePort,
    docsReader as unknown as DocumentosFisicosReaderPort,
    asociacionRepo as unknown as AsociacionComprobanteRepositoryPort,
    prisma,
    auditedRunner as unknown as AuditedTransactionRunner,
    rbac as unknown as RbacService,
  );
  return {
    service,
    repo,
    periodos,
    cuentas,
    contactos,
    clock,
    secuencia,
    docsReader,
    asociacionRepo,
    rbac,
    auditedRunner,
    prisma,
  };
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

    // ----------------------------------------------------------------
    // Documentos físicos asociados al contabilizar (task 7.1, design §4.3)
    // ----------------------------------------------------------------

    it('sin docs asociados: no consulta docs ni refresca el cache de estado', async () => {
      const { service, docsReader, asociacionRepo } = setupHappyPath();
      // listarPorComprobante default → [] (sin asociaciones).

      await service.contabilizar(TENANT_ID, USER_ID, 'comp-b');

      expect(asociacionRepo.listarPorComprobante).toHaveBeenCalledWith(
        TENANT_ID,
        'comp-b',
        expect.any(Object),
      );
      expect(docsReader.idsYaAsociadosAContabilizado).not.toHaveBeenCalled();
      expect(asociacionRepo.refrescarEstadoComprobante).not.toHaveBeenCalled();
    });

    it('con docs válidos: refresca el cache de estado a CONTABILIZADO', async () => {
      const DOC_1 = '11111111-1111-4111-a111-111111111111';
      const { service, docsReader, asociacionRepo } = setupHappyPath();
      asociacionRepo.listarPorComprobante.mockResolvedValue([
        {
          id: 'asoc-1',
          organizationId: TENANT_ID,
          comprobanteId: 'comp-b',
          documentoFisicoId: DOC_1,
          comprobanteEstado: EstadoComprobante.BORRADOR,
          createdAt: new Date(),
        },
      ]);
      docsReader.idsYaAsociadosAContabilizado.mockResolvedValue([]);

      await service.contabilizar(TENANT_ID, USER_ID, 'comp-b');

      expect(docsReader.idsYaAsociadosAContabilizado).toHaveBeenCalledWith(
        TENANT_ID,
        [DOC_1],
        'comp-b',
        expect.any(Object),
      );
      expect(asociacionRepo.refrescarEstadoComprobante).toHaveBeenCalledWith(
        TENANT_ID,
        'comp-b',
        EstadoComprobante.CONTABILIZADO,
        expect.any(Object),
      );
    });

    it('con doc ya contabilizado en otro: lanza error con el id real y NO refresca', async () => {
      const DOC_1 = '11111111-1111-4111-a111-111111111111';
      const { service, docsReader, asociacionRepo, repo } = setupHappyPath();
      asociacionRepo.listarPorComprobante.mockResolvedValue([
        {
          id: 'asoc-1',
          organizationId: TENANT_ID,
          comprobanteId: 'comp-b',
          documentoFisicoId: DOC_1,
          comprobanteEstado: EstadoComprobante.BORRADOR,
          createdAt: new Date(),
        },
      ]);
      docsReader.idsYaAsociadosAContabilizado.mockResolvedValue([DOC_1]);

      await expect(service.contabilizar(TENANT_ID, USER_ID, 'comp-b')).rejects.toMatchObject({
        code: 'DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO',
        details: { documentoFisicoId: DOC_1 },
      });
      expect(asociacionRepo.refrescarEstadoComprobante).not.toHaveBeenCalled();
      expect(repo.contabilizar).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // anular — modelo flag (task 5.1 / comprobantes-anulacion-refactor)
  // Cubre spec §2.2 + catálogo de errors §3:
  //   COMPROBANTE_ANULAR_YA_ANULADO        — 409
  //   COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO — 409
  //   COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO  — 409 (BLOQUEADO)
  //   COMPROBANTE_ANULAR_PERIODO_CERRADO   — 409
  //   COMPROBANTE_ANULAR_MOTIVO_INVALIDO   — 422
  // ============================================================

  describe('anular', () => {
    // Helper: comprobante listo para anular (CONTABILIZADO, anulado=false, período ABIERTO)
    function setupAnularHappyPath() {
      const { service, repo, periodos, asociacionRepo, clock, auditedRunner, secuencia } = buildService();

      const comp = comprobanteFactory({
        id: 'comp-c',
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'D2604-000042',
        anulado: false,
        periodoFiscalId: PERIODO_ID,
      });

      repo.findById.mockResolvedValue(comp);
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.ABIERTO,
      });
      periodos.obtenerReaperturaActiva.mockResolvedValue(null);

      // El repositorio devuelve el comprobante con anulado=true tras el UPDATE
      const anulado = {
        ...comp,
        anulado: true,
        fechaAnulacion: new Date('2026-04-22T12:00:00Z'),
        motivoAnulacion: 'Error en imputación al cliente',
        anuladoPorUserId: USER_ID,
      };
      repo.marcarAnulado.mockResolvedValue(anulado);

      return { service, repo, periodos, asociacionRepo, clock, auditedRunner, secuencia, anulado };
    }

    it('happy path: marca anulado=true en el propio comprobante (REQ-COMP-ANULAR-01)', async () => {
      const { service, repo, anulado } = setupAnularHappyPath();

      const result = await service.anular(TENANT_ID, USER_ID, 'comp-c', 'Error en imputación al cliente');

      // Resultado: el comprobante con anulado=true y los 3 metadatos
      expect(result.anulado).toBe(true);
      expect(result.fechaAnulacion).toBeDefined();
      expect(result.motivoAnulacion).toBe('Error en imputación al cliente');
      expect(result.anuladoPorUserId).toBe(USER_ID);
      // Preserva numero y estado CONTABILIZADO (REQ-COMP-ANULAR-05, REQ-COMP-ANULAR-06)
      expect(result.numero).toBe(anulado.numero);
      expect(result.estado).toBe(EstadoComprobante.CONTABILIZADO);
    });

    it('preserva el numero correlativo (REQ-COMP-CORRELATIVO-03, escenario 24)', async () => {
      const { service } = setupAnularHappyPath();

      const result = await service.anular(TENANT_ID, USER_ID, 'comp-c', 'Error en imputación al cliente');

      expect(result.numero).toBe('D2604-000042');
    });

    it('llama a auditedTx.run con userId y motivo (REQ-COMP-AUDIT-03)', async () => {
      const { service, auditedRunner } = setupAnularHappyPath();

      await service.anular(TENANT_ID, USER_ID, 'comp-c', 'Error en imputación al cliente');

      expect(auditedRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, motivo: 'Error en imputación al cliente' }),
        expect.any(Function),
      );
    });

    it('propaga reaperturaId al wrapper cuando hay reapertura activa (REQ-COMP-REAPERTURA-02, escenario 15)', async () => {
      const { service, periodos, auditedRunner, repo } = buildService();
      const comp = comprobanteFactory({
        id: 'comp-c',
        estado: EstadoComprobante.CONTABILIZADO,
        anulado: false,
        periodoFiscalId: PERIODO_ID,
      });
      repo.findById.mockResolvedValue(comp);
      periodos.obtenerPorFecha.mockResolvedValue({ id: PERIODO_ID, status: PeriodoFiscalStatus.CERRADO });
      // Reapertura activa sobre el período
      periodos.obtenerReaperturaActiva.mockResolvedValue({ id: 'reap-001', reopenedAt: new Date() });
      repo.marcarAnulado.mockResolvedValue({ ...comp, anulado: true, fechaAnulacion: new Date(), motivoAnulacion: 'Motivo válido OK', anuladoPorUserId: USER_ID });

      await service.anular(TENANT_ID, USER_ID, 'comp-c', 'Motivo válido OK');

      expect(auditedRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({ reaperturaId: 'reap-001' }),
        expect.any(Function),
      );
    });

    it('rechaza si anulado=true ya (COMPROBANTE_ANULAR_YA_ANULADO, 409) — REQ-COMP-ANULAR-03', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ estado: EstadoComprobante.CONTABILIZADO, anulado: true }),
      );

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-c', 'Motivo suficiente largo'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_ANULAR_YA_ANULADO' });
    });

    it('rechaza si estado=BORRADOR (COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO, 409) — REQ-COMP-ANULAR-04', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ estado: EstadoComprobante.BORRADOR }));

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-b', 'Motivo suficiente largo'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO' });
    });

    it('rechaza si estado=BLOQUEADO (COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO, 409)', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ estado: EstadoComprobante.BLOQUEADO }));

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-b', 'Motivo suficiente largo'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO' });
    });

    it('rechaza si período cerrado y sin reapertura activa (COMPROBANTE_ANULAR_PERIODO_CERRADO, 409) — escenario 14', async () => {
      const { service, repo, periodos } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ estado: EstadoComprobante.CONTABILIZADO, anulado: false }),
      );
      periodos.obtenerPorFecha.mockResolvedValue({ id: PERIODO_ID, status: PeriodoFiscalStatus.CERRADO });
      periodos.obtenerReaperturaActiva.mockResolvedValue(null);

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-c', 'Motivo suficiente largo'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_ANULAR_PERIODO_CERRADO' });
    });

    it('permite anular si período cerrado pero hay reapertura activa (REQ-COMP-REAPERTURA-01, escenario 15)', async () => {
      const { service, repo, periodos } = buildService();
      const comp = comprobanteFactory({ id: 'comp-c', estado: EstadoComprobante.CONTABILIZADO, anulado: false });
      repo.findById.mockResolvedValue(comp);
      periodos.obtenerPorFecha.mockResolvedValue({ id: PERIODO_ID, status: PeriodoFiscalStatus.CERRADO });
      periodos.obtenerReaperturaActiva.mockResolvedValue({ id: 'reap-001', reopenedAt: new Date() });
      repo.marcarAnulado.mockResolvedValue({ ...comp, anulado: true, fechaAnulacion: new Date(), motivoAnulacion: 'Corrección post-cierre X', anuladoPorUserId: USER_ID });

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-c', 'Corrección post-cierre X'),
      ).resolves.toMatchObject({ anulado: true });
    });

    it('rechaza si motivo.trim().length < 10 (COMPROBANTE_ANULAR_MOTIVO_INVALIDO, 422) — REQ-COMP-ANULAR-02', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ estado: EstadoComprobante.CONTABILIZADO, anulado: false }),
      );

      // 9 caracteres no-whitespace
      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-c', '123456789'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_ANULAR_MOTIVO_INVALIDO' });
    });

    it('rechaza si motivo es solo whitespace (COMPROBANTE_ANULAR_MOTIVO_INVALIDO, 422) — escenario 12', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ estado: EstadoComprobante.CONTABILIZADO, anulado: false }),
      );

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-c', '               '),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_ANULAR_MOTIVO_INVALIDO' });
    });

    it('NO consume SecuenciaComprobantePort (REQ-COMP-ANULAR-06)', async () => {
      const { service, secuencia } = setupAnularHappyPath();

      await service.anular(TENANT_ID, USER_ID, 'comp-c', 'Error en imputación al cliente');

      expect(secuencia.siguienteCorrelativo).not.toHaveBeenCalled();
    });

    it('desasocia documentos físicos del comprobante anulado (CLAUDE.md §4.7)', async () => {
      const { service, asociacionRepo } = setupAnularHappyPath();

      await service.anular(TENANT_ID, USER_ID, 'comp-c', 'Error en imputación al cliente');

      expect(asociacionRepo.desasociarTodasDelComprobante).toHaveBeenCalledWith(
        TENANT_ID,
        'comp-c',
        expect.anything(),
      );
    });

    it('lanza 404 si el comprobante no existe', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(null);

      await expect(
        service.anular(TENANT_ID, USER_ID, 'comp-x', 'Motivo suficiente largo'),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_NO_ENCONTRADO' });
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

    // ——— incluirAnulados toggle (task 5.6 / REQ-COMP-REPORTES-01) ———

    it('default oculta anulados (incluirAnulados=false implícito) — REQ-COMP-REPORTES-01', async () => {
      const { service, repo } = buildService();
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, {});

      // El filtro debe ir con incluirAnulados: false (o ausente + default false en repo)
      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ incluirAnulados: false }),
        expect.any(Object),
      );
    });

    it('incluirAnulados=true los incluye — REQ-COMP-REPORTES-01', async () => {
      const { service, repo } = buildService();
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, { incluirAnulados: true });

      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ incluirAnulados: true }),
        expect.any(Object),
      );
    });
  });

  // ============================================================
  // Documentos físicos asociados (task 6.3)
  // ============================================================

  describe('asociarDocumentos', () => {
    const DOC_1 = '11111111-1111-4111-a111-111111111111';
    const DOC_2 = '22222222-2222-4222-a222-222222222222';

    function docParaAsociarFactory(
      overrides: Partial<DocumentoFisicoParaAsociar> = {},
    ): DocumentoFisicoParaAsociar {
      return {
        id: DOC_1,
        numero: 'FAC-001',
        tipoDocumentoFisicoId: 'tipo-1',
        tipoDocumentoNombre: 'Factura emitida',
        esTributario: true,
        fechaEmision: new Date('2026-04-01'),
        monto: new Prisma.Decimal('100'),
        moneda: Moneda.BOB,
        contactoId: null,
        tiposComprobanteAplicables: [TipoComprobante.DIARIO, TipoComprobante.INGRESO],
        ...overrides,
      };
    }

    function asociacionRowFactory(documentoFisicoId: string): ComprobanteDocumentoFisico {
      return {
        id: `asoc-${documentoFisicoId}`,
        organizationId: TENANT_ID,
        comprobanteId: 'comp-borrador',
        documentoFisicoId,
        comprobanteEstado: EstadoComprobante.BORRADOR,
        createdAt: new Date(),
      };
    }

    it('ids vacíos → no-op, no consulta nada', async () => {
      const { service, repo, docsReader, asociacionRepo } = buildService();

      const r = await service.asociarDocumentos(TENANT_ID, 'comp-borrador', []);

      expect(r).toEqual([]);
      expect(repo.findById).not.toHaveBeenCalled();
      expect(docsReader.obtenerBatchParaAsociar).not.toHaveBeenCalled();
      expect(asociacionRepo.asociar).not.toHaveBeenCalled();
    });

    it('lanza ComprobanteNoEncontradoError si el comprobante no existe', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(null);

      await expect(service.asociarDocumentos(TENANT_ID, 'comp-x', [DOC_1])).rejects.toMatchObject({
        code: 'COMPROBANTE_NO_ENCONTRADO',
      });
    });

    it('lanza ComprobanteNoEsBorradorError si el comprobante no está en BORRADOR', async () => {
      const { service, repo, asociacionRepo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ id: 'comp-1', estado: EstadoComprobante.CONTABILIZADO }),
      );

      await expect(service.asociarDocumentos(TENANT_ID, 'comp-1', [DOC_1])).rejects.toMatchObject({
        code: 'COMPROBANTE_NO_ES_BORRADOR',
        details: { comprobanteId: 'comp-1', estadoActual: EstadoComprobante.CONTABILIZADO },
      });
      expect(asociacionRepo.asociar).not.toHaveBeenCalled();
    });

    it('lanza DocumentoFisicoReferenciadoNoExisteError si un id falta del Map (cross-tenant) — E-A-07', async () => {
      const { service, repo, docsReader, asociacionRepo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ id: 'comp-borrador', tipo: TipoComprobante.DIARIO }),
      );
      // Map vacío: el doc no existe o es de otro tenant.
      docsReader.obtenerBatchParaAsociar.mockResolvedValue(new Map());

      await expect(
        service.asociarDocumentos(TENANT_ID, 'comp-borrador', [DOC_1]),
      ).rejects.toMatchObject({
        code: 'COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE',
        details: { documentoFisicoId: DOC_1 },
      });
      expect(asociacionRepo.asociar).not.toHaveBeenCalled();
    });

    it('lanza TipoDocumentoIncompatibleConComprobanteError si el tipo no aplica — E-A-09', async () => {
      const { service, repo, docsReader, asociacionRepo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ id: 'comp-ingreso', tipo: TipoComprobante.INGRESO }),
      );
      docsReader.obtenerBatchParaAsociar.mockResolvedValue(
        new Map([
          [
            DOC_1,
            docParaAsociarFactory({
              id: DOC_1,
              numero: 'RE-001',
              tipoDocumentoNombre: 'Recibo de Egreso',
              // recibo-egreso: solo EGRESO, DIARIO. INGRESO no aplica.
              tiposComprobanteAplicables: [TipoComprobante.EGRESO, TipoComprobante.DIARIO],
            }),
          ],
        ]),
      );

      await expect(
        service.asociarDocumentos(TENANT_ID, 'comp-ingreso', [DOC_1]),
      ).rejects.toMatchObject({
        code: 'TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE',
        details: {
          // El nombre del tipo (no el número del documento) debe aparecer en details.
          tipoDocumentoNombre: 'Recibo de Egreso',
          tipoComprobante: TipoComprobante.INGRESO,
          tiposPermitidos: [TipoComprobante.EGRESO, TipoComprobante.DIARIO],
        },
      });
      expect(asociacionRepo.asociar).not.toHaveBeenCalled();
    });

    it('asocia un tipo compatible (factura-emitida a INGRESO) — E-A-10', async () => {
      const { service, repo, docsReader, asociacionRepo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ id: 'comp-ingreso', tipo: TipoComprobante.INGRESO }),
      );
      docsReader.obtenerBatchParaAsociar.mockResolvedValue(
        new Map([
          [
            DOC_1,
            docParaAsociarFactory({
              id: DOC_1,
              tiposComprobanteAplicables: [TipoComprobante.INGRESO, TipoComprobante.DIARIO],
            }),
          ],
        ]),
      );
      asociacionRepo.asociar.mockResolvedValue(asociacionRowFactory(DOC_1));

      const r = await service.asociarDocumentos(TENANT_ID, 'comp-ingreso', [DOC_1]);

      expect(r).toHaveLength(1);
      expect(asociacionRepo.asociar).toHaveBeenCalledWith(
        TENANT_ID,
        {
          comprobanteId: 'comp-ingreso',
          documentoFisicoId: DOC_1,
          comprobanteEstado: EstadoComprobante.BORRADOR,
        },
        expect.any(Object),
      );
    });

    it('asocia múltiples documentos en una sola llamada — E-A-08', async () => {
      const { service, repo, docsReader, asociacionRepo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ id: 'comp-borrador', tipo: TipoComprobante.DIARIO }),
      );
      docsReader.obtenerBatchParaAsociar.mockResolvedValue(
        new Map([
          [DOC_1, docParaAsociarFactory({ id: DOC_1 })],
          [DOC_2, docParaAsociarFactory({ id: DOC_2 })],
        ]),
      );
      asociacionRepo.asociar.mockImplementation(async (_t, input) =>
        asociacionRowFactory(input.documentoFisicoId),
      );

      const r = await service.asociarDocumentos(TENANT_ID, 'comp-borrador', [DOC_1, DOC_2]);

      expect(r).toHaveLength(2);
      expect(asociacionRepo.asociar).toHaveBeenCalledTimes(2);
    });

    it('es idempotente: no re-inserta un par ya asociado', async () => {
      const { service, repo, docsReader, asociacionRepo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ id: 'comp-borrador', tipo: TipoComprobante.DIARIO }),
      );
      docsReader.obtenerBatchParaAsociar.mockResolvedValue(
        new Map([
          [DOC_1, docParaAsociarFactory({ id: DOC_1 })],
          [DOC_2, docParaAsociarFactory({ id: DOC_2 })],
        ]),
      );
      // DOC_1 ya está asociado: solo DOC_2 debe insertarse.
      asociacionRepo.listarPorComprobante.mockResolvedValue([asociacionRowFactory(DOC_1)]);
      asociacionRepo.asociar.mockImplementation(async (_t, input) =>
        asociacionRowFactory(input.documentoFisicoId),
      );

      const r = await service.asociarDocumentos(TENANT_ID, 'comp-borrador', [DOC_1, DOC_2]);

      expect(r).toHaveLength(1);
      expect(asociacionRepo.asociar).toHaveBeenCalledTimes(1);
      expect(asociacionRepo.asociar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ documentoFisicoId: DOC_2 }),
        expect.any(Object),
      );
    });
  });

  describe('desasociarDocumento', () => {
    const DOC_1 = '11111111-1111-4111-a111-111111111111';

    it('lanza ComprobanteNoEncontradoError si el comprobante no existe', async () => {
      const { service, repo } = buildService();
      repo.findById.mockResolvedValue(null);

      await expect(service.desasociarDocumento(TENANT_ID, 'comp-x', DOC_1)).rejects.toMatchObject({
        code: 'COMPROBANTE_NO_ENCONTRADO',
      });
    });

    it('desasocia de un BORRADOR — E-A-04', async () => {
      const { service, repo, asociacionRepo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ id: 'comp-borrador', estado: EstadoComprobante.BORRADOR }),
      );

      await expect(
        service.desasociarDocumento(TENANT_ID, 'comp-borrador', DOC_1),
      ).resolves.toBeUndefined();
      expect(asociacionRepo.desasociar).toHaveBeenCalledWith(TENANT_ID, 'comp-borrador', DOC_1);
    });

    it('rechaza desasociar de un CONTABILIZADO — E-A-05', async () => {
      const { service, repo, asociacionRepo } = buildService();
      repo.findById.mockResolvedValue(
        comprobanteFactory({ id: 'comp-c', estado: EstadoComprobante.CONTABILIZADO }),
      );

      await expect(service.desasociarDocumento(TENANT_ID, 'comp-c', DOC_1)).rejects.toMatchObject({
        code: 'COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO',
        details: { comprobanteId: 'comp-c', documentoFisicoId: DOC_1 },
      });
      expect(asociacionRepo.desasociar).not.toHaveBeenCalled();
    });
  });

  describe('listarDocumentosAsociados', () => {
    function docConRelacionesFactory(): DocumentoFisicoConRelaciones {
      return {
        id: 'doc-1',
        organizationId: TENANT_ID,
        tipoDocumentoFisicoId: 'tipo-1',
        numero: 'FAC-001',
        fechaEmision: new Date('2026-04-01'),
        monto: new Prisma.Decimal('1150.00'),
        moneda: Moneda.BOB,
        glosa: null,
        contactoId: null,
        createdAt: new Date('2026-04-01T10:00:00Z'),
        createdByUserId: USER_ID,
        updatedAt: new Date('2026-04-01T10:00:00Z'),
        tipoDocumento: {
          id: 'tipo-1',
          nombre: 'Factura emitida',
          codigo: 'factura-emitida',
          esTributario: true,
        },
        contacto: null,
      } as unknown as DocumentoFisicoConRelaciones;
    }

    it('lanza ComprobanteNoEncontradoError si el comprobante no existe (REQ-S-04)', async () => {
      const { service, repo, docsReader } = buildService();
      repo.findById.mockResolvedValue(null);

      await expect(service.listarDocumentosAsociados(TENANT_ID, 'comp-x')).rejects.toMatchObject({
        code: 'COMPROBANTE_NO_ENCONTRADO',
      });
      expect(docsReader.listarAsociadosDeComprobante).not.toHaveBeenCalled();
    });

    it('devuelve los documentos del comprobante mapeados a DocumentoFisicoAsociadoDto — REQ-A-09', async () => {
      const { service, repo, docsReader } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ id: 'comp-1' }));
      docsReader.listarAsociadosDeComprobante.mockResolvedValue([docConRelacionesFactory()]);

      const r = await service.listarDocumentosAsociados(TENANT_ID, 'comp-1');

      expect(docsReader.listarAsociadosDeComprobante).toHaveBeenCalledWith(TENANT_ID, 'comp-1');
      expect(r).toEqual([
        {
          id: 'doc-1',
          numero: 'FAC-001',
          tipoDocumentoFisico: { id: 'tipo-1', nombre: 'Factura emitida' },
          monto: '1150',
          moneda: Moneda.BOB,
          fechaEmision: '2026-04-01',
        },
      ]);
    });

    it('devuelve lista vacía si el comprobante no tiene documentos', async () => {
      const { service, repo, docsReader } = buildService();
      repo.findById.mockResolvedValue(comprobanteFactory({ id: 'comp-1' }));
      docsReader.listarAsociadosDeComprobante.mockResolvedValue([]);

      const r = await service.listarDocumentosAsociados(TENANT_ID, 'comp-1');

      expect(r).toEqual([]);
    });
  });
});
