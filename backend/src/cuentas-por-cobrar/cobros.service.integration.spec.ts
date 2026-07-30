import {
  ClaseCuenta,
  CondicionPago,
  EstadoComprobante,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import { AuditedTransactionRunner } from '@/common/audited-transaction.runner';
import { SystemClockAdapter } from '@/common/clock/system-clock.adapter';
import type { PrismaService } from '@/common/prisma.service';
import { PrismaComprobanteRepository } from '@/comprobantes/adapters/prisma-comprobante.repository';
import { PrismaSecuenciaComprobanteAdapter } from '@/comprobantes/adapters/prisma-secuencia-comprobante';
import { ComprobanteSistemaWriterService } from '@/comprobantes/comprobante-sistema-writer.service';
import { ComprobantesService } from '@/comprobantes/comprobantes.service';
import { PrismaContactosReaderAdapter } from '@/contactos/adapters/prisma-contactos-reader.adapter';
import { PrismaCuentasEfectivoReaderAdapter } from '@/cuentas/adapters/prisma-cuentas-efectivo-reader.adapter';
import { PrismaCuentasReaderAdapter } from '@/cuentas/adapters/prisma-cuentas-reader.adapter';
import { PrismaAsociacionComprobanteRepository } from '@/documentos-fisicos/adapters/prisma-asociacion-comprobante.repository';
import { PrismaPeriodosReaderAdapter } from '@/periodos-fiscales/adapters/prisma-periodos-reader.adapter';

import { PrismaCarteraReaderAdapter } from './adapters/prisma-cartera-reader.adapter';
import { PrismaCobroRepository } from './adapters/prisma-cobro.repository';
import { PrismaCobrosConfigReaderAdapter } from './adapters/prisma-cobros-config-reader.adapter';
import { type CrearCobroInput, CobrosService } from './cobros.service';

/**
 * Integration del ciclo de vida del cobro y del CRUD de aplicaciones, de punta
 * a punta contra Postgres real: valida lo que SOLO la base puede contestar —
 * atomicidad de la TX única (REQ-CXC-02), el actor en `comprobantes_audit`
 * (§4.3), el period lock sobre períodos reales (REQ-CXC-09, con las
 * aplicaciones EXENTAS), el aislamiento multi-tenant del vínculo (REQ-CXC-08),
 * la sobre-aplicación bajo concurrencia real (REQ-CXC-04) y el criterio de
 * éxito 4 del change: el comprobante del cobro BYTE-IDÉNTICO ante cualquier
 * re-imputación (D-03).
 *
 * §11.3: la suite corre contra la MISMA base de desarrollo — TODA aserción de
 * conteo va acotada a los tenants que este test crea.
 */
describe('CobrosService (integration)', () => {
  const SLUG_A = 'org-test-cobros-service-a';
  const SLUG_B = 'org-test-cobros-service-b';
  const USER_ID = 'user-seed-cobros-service';

  let prisma: PrismaClient;
  let runner: AuditedTransactionRunner;
  let service: CobrosService;
  let tenantA: string;
  let tenantB: string;
  let contactoA: string;
  let contactoA2: string;
  let contactoB: string;
  let cuentaCaja: string;
  let cuentaCxc: string;
  let cuentaGasto: string;
  let periodoJulio: string;
  let numeroVentaSeq = 0;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    const comprobanteRepo = new PrismaComprobanteRepository(prismaService);
    runner = new AuditedTransactionRunner(prismaService);

    // ComprobantesService REAL (mismo armado que ventas.service.integration):
    // las dependencias fuera del camino de sistema son stubs que REVIENTAN si
    // algo las toca — delatan un cambio de alcance, no lo esconden.
    const explotaSiSeLlama = (nombre: string) => () => {
      throw new Error(`${nombre} no debe alcanzarse desde el camino de sistema de cobros`);
    };
    const comprobantesService = new ComprobantesService(
      comprobanteRepo,
      new PrismaPeriodosReaderAdapter(prismaService),
      new PrismaCuentasReaderAdapter(prismaService),
      new PrismaContactosReaderAdapter(prismaService),
      new SystemClockAdapter(),
      new PrismaSecuenciaComprobanteAdapter(prismaService),
      {
        idsYaAsociadosAContabilizado: explotaSiSeLlama('documentosFisicosReader'),
      } as never,
      new PrismaAsociacionComprobanteRepository(prismaService),
      prismaService,
      runner,
      { hasPermission: explotaSiSeLlama('rbac.hasPermission') } as never,
      { get: (_key: string, defaultVal: unknown) => defaultVal } as never,
      null as never, // storage — adjuntos no participan
      null as never, // adjuntoRepo — ídem
      { estaGestionCerradaPorPeriodo: explotaSiSeLlama('gestionStatus') } as never,
    );
    const writer = new ComprobanteSistemaWriterService(
      comprobanteRepo,
      new PrismaCuentasReaderAdapter(prismaService),
      new PrismaContactosReaderAdapter(prismaService),
      new PrismaPeriodosReaderAdapter(prismaService),
      new SystemClockAdapter(),
      comprobantesService,
    );

    service = new CobrosService(
      new PrismaCobroRepository(prismaService),
      writer,
      new PrismaContactosReaderAdapter(prismaService),
      new PrismaCuentasEfectivoReaderAdapter(prismaService),
      new PrismaPeriodosReaderAdapter(prismaService),
      new PrismaCobrosConfigReaderAdapter(prismaService),
      new PrismaCarteraReaderAdapter(prismaService),
      runner,
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A cobros service' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B cobros service' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    contactoA = (await crearContacto(tenantA, 'Avícola Sur')).id;
    contactoA2 = (await crearContacto(tenantA, 'Granja Norte')).id;
    contactoB = (await crearContacto(tenantB, 'Cliente ajeno')).id;

    cuentaCaja = (await crearCuenta(tenantA, '1.1.1.001', 'CAJA GENERAL', ClaseCuenta.ACTIVO)).id;
    cuentaCxc = (
      await crearCuenta(tenantA, '1.1.2.001', 'CUENTAS POR COBRAR', ClaseCuenta.ACTIVO, {
        requiereContacto: true,
      })
    ).id;
    cuentaGasto = (await crearCuenta(tenantA, '5.1.1.001', 'GASTOS GENERALES', ClaseCuenta.EGRESO))
      .id;

    await prisma.orgConfiguracionContable.create({
      data: { organizationId: tenantA, cuentasPorCobrarId: cuentaCxc },
    });

    const gestion = await prisma.gestionFiscal.create({
      data: { organizationId: tenantA, year: 2026, mesInicio: 1 },
    });
    periodoJulio = (
      await prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: gestion.id,
          year: 2026,
          month: 7,
          ordenEnGestion: 7,
        },
      })
    ).id;
    await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantA,
        gestionId: gestion.id,
        year: 2026,
        month: 6,
        ordenEnGestion: 6,
        status: PeriodoFiscalStatus.CERRADO,
      },
    });
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      // El delete de comprobantes va DENTRO del runner: tras cualquier TX
      // auditada, la conexión del pool queda con los GUC `app.audit_*` en '' y
      // el trigger revienta con 22P02 fuera de una TX auditada (§11.3).
      await runner.run({ userId: USER_ID }, async (tx) => {
        await tx.venta.deleteMany({ where: { organizationId: { in: orgIds } } });
        await tx.cobro.deleteMany({ where: { organizationId: { in: orgIds } } });
        await tx.comprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      });
      await prisma.$executeRaw`DELETE FROM comprobantes_audit WHERE organization_id::text = ANY(${orgIds})`;
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  function crearContacto(organizationId: string, razonSocial: string) {
    return prisma.contacto.create({
      data: { organizationId, razonSocial, esCliente: true, createdByUserId: USER_ID },
    });
  }

  function crearCuenta(
    organizationId: string,
    codigoInterno: string,
    nombre: string,
    claseCuenta: ClaseCuenta,
    over: { requiereContacto?: boolean } = {},
  ) {
    return prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre,
        claseCuenta,
        naturaleza:
          claseCuenta === ClaseCuenta.INGRESO
            ? NaturalezaCuenta.ACREEDORA
            : NaturalezaCuenta.DEUDORA,
        nivel: 3,
        esDetalle: true,
        ...over,
      },
    });
  }

  function inputCobro(over: Partial<CrearCobroInput> = {}): CrearCobroInput {
    return {
      contactoId: contactoA,
      fechaContable: '2026-07-15',
      monto: '500.00',
      cuentaDestinoId: cuentaCaja,
      glosa: 'pago parcial de la factura 12',
      ...over,
    };
  }

  /**
   * Venta a crédito fabricada directo en BD con su comprobante CONTABILIZADO
   * (este módulo NO escribe ventas, §3.3; el flujo real es de `VentasService`).
   * El comprobante va DENTRO del runner por los GUC de los triggers.
   */
  async function crearVentaContabilizada(
    over: Partial<{
      contactoId: string;
      montoTotal: string;
      tenantId: string;
      estado: EstadoComprobante;
      condicionPago: CondicionPago;
    }> = {},
  ) {
    const tenantId = over.tenantId ?? tenantA;
    const condicionPago = over.condicionPago ?? CondicionPago.CREDITO;
    const venta = await prisma.venta.create({
      data: {
        organizationId: tenantId,
        contactoId: over.contactoId ?? (tenantId === tenantA ? contactoA : contactoB),
        fechaContable: new Date('2026-07-10'),
        condicionPago,
        // REQ-VTA-02: CREDITO exige vencimiento; CONTADO lo prohíbe.
        fechaVencimiento: condicionPago === CondicionPago.CREDITO ? new Date('2026-08-10') : null,
        glosa: 'Venta de prueba',
        montoTotal: new Prisma.Decimal(over.montoTotal ?? '1000.00'),
        createdByUserId: USER_ID,
      },
    });
    if (tenantId === tenantA) {
      numeroVentaSeq += 1;
      const numero = `V2607-${String(numeroVentaSeq).padStart(6, '0')}`;
      await runner.run({ userId: USER_ID }, (tx) =>
        tx.comprobante.create({
          data: {
            organizationId: tenantId,
            tipo: TipoComprobante.VENTA,
            estado: over.estado ?? EstadoComprobante.CONTABILIZADO,
            numero,
            fechaContable: new Date('2026-07-10'),
            periodoFiscalId: periodoJulio,
            glosa: 'Comprobante de la venta de prueba',
            origenTipo: 'VENTA',
            origenId: venta.id,
            generadoPorSistema: true,
            createdByUserId: USER_ID,
          },
        }),
      );
    }
    return venta;
  }

  async function crearCobroContabilizado(monto = '500.00') {
    const { cobro, comprobanteId } = await service.crear(tenantA, USER_ID, inputCobro({ monto }));
    const { numero } = await service.contabilizar(tenantA, cobro.id, USER_ID);
    return { cobroId: cobro.id, comprobanteId, numero };
  }

  function comprobanteDb(comprobanteId: string) {
    return prisma.comprobante.findFirstOrThrow({
      where: { id: comprobanteId, organizationId: tenantA },
      include: { lineas: { orderBy: { orden: 'asc' } } },
    });
  }

  async function contarDelTenant() {
    const [cobros, comprobantes, aplicaciones] = await Promise.all([
      prisma.cobro.count({ where: { organizationId: tenantA } }),
      prisma.comprobante.count({
        where: { organizationId: tenantA, origenTipo: 'COBRO' },
      }),
      prisma.aplicacionCobro.count({ where: { organizationId: tenantA } }),
    ]);
    return { cobros, comprobantes, aplicaciones };
  }

  describe('crear — alta de punta a punta (REQ-CXC-02)', () => {
    it('persiste cobro + comprobante INGRESO BORRADOR de sistema en UNA transacción, con el asiento fijo', async () => {
      const { cobro, comprobanteId } = await service.crear(tenantA, USER_ID, inputCobro());

      const cobroDb = await prisma.cobro.findFirstOrThrow({
        where: { id: cobro.id, organizationId: tenantA },
      });
      expect(cobroDb.monto.toString()).toBe('500');
      expect(cobroDb.contactoId).toBe(contactoA);

      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante).toMatchObject({
        estado: EstadoComprobante.BORRADOR,
        generadoPorSistema: true,
        tipo: TipoComprobante.INGRESO,
        origenTipo: 'COBRO',
        origenId: cobro.id,
        numero: null,
        anulado: false,
      });
      // Q-2: la glosa se sostiene sola — operación + cliente, no "Cobro #id".
      expect(comprobante.glosa).toContain('Cobro a');
      expect(comprobante.glosa).toContain('Avícola Sur');

      // Debe destino / Haber CxC, AMBAS líneas con el contacto (B-1).
      expect(comprobante.lineas).toHaveLength(2);
      expect(comprobante.lineas[0]).toMatchObject({ cuentaId: cuentaCaja, contactoId: contactoA });
      expect(comprobante.lineas[0]?.debitoBob.toString()).toBe('500');
      expect(comprobante.lineas[1]).toMatchObject({ cuentaId: cuentaCxc, contactoId: contactoA });
      expect(comprobante.lineas[1]?.creditoBob.toString()).toBe('500');
    });

    it('la escritura corre en la TX AUDITADA: comprobantes_audit registra el actor (§4.3)', async () => {
      const { comprobanteId } = await service.crear(tenantA, USER_ID, inputCobro());

      const auditorias = await prisma.$queryRaw<
        { usuario_id: string | null }[]
      >`SELECT usuario_id FROM comprobantes_audit
        WHERE comprobante_id = ${comprobanteId}::uuid AND tabla = 'comprobantes'`;

      expect(auditorias.length).toBeGreaterThan(0);
      auditorias.forEach((fila) => {
        expect(fila.usuario_id).toBe(USER_ID);
      });
    });

    it('cuenta de gasto activa y de detalle → COBRO_CUENTA_DESTINO_NO_ELEGIBLE y NADA persiste', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputCobro({ cuentaDestinoId: cuentaGasto })),
      ).rejects.toMatchObject({ code: 'COBRO_CUENTA_DESTINO_NO_ELEGIBLE', httpStatus: 422 });

      await expect(contarDelTenant()).resolves.toEqual({
        cobros: 0,
        comprobantes: 0,
        aplicaciones: 0,
      });
    });

    it('org sin cuentasPorCobrarId mapeada → COBRO_CONCEPTO_NO_CONFIGURADO (B-12)', async () => {
      await prisma.orgConfiguracionContable.update({
        where: { organizationId: tenantA },
        data: { cuentasPorCobrarId: null },
      });

      await expect(service.crear(tenantA, USER_ID, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_CONCEPTO_NO_CONFIGURADO',
        httpStatus: 422,
      });
      await expect(contarDelTenant()).resolves.toMatchObject({ cobros: 0, comprobantes: 0 });
    });

    it('contacto de otro tenant → COBRO_CONTACTO_NO_ENCONTRADO (404, no 403)', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputCobro({ contactoId: contactoB })),
      ).rejects.toMatchObject({ code: 'COBRO_CONTACTO_NO_ENCONTRADO', httpStatus: 404 });
    });
  });

  describe('period lock (REQ-CXC-09) sobre períodos reales', () => {
    it('período CERRADO → COBRO_PERIODO_NO_ABIERTO y NADA persiste', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputCobro({ fechaContable: '2026-06-15' })),
      ).rejects.toMatchObject({ code: 'COBRO_PERIODO_NO_ABIERTO', httpStatus: 409 });

      await expect(contarDelTenant()).resolves.toMatchObject({ cobros: 0, comprobantes: 0 });
    });

    it('fecha sin período (gestión inexistente) → COBRO_GESTION_NO_ABIERTA', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputCobro({ fechaContable: '2025-03-15' })),
      ).rejects.toMatchObject({ code: 'COBRO_GESTION_NO_ABIERTA', httpStatus: 422 });
    });

    it('período cerrado entre el borrador y el contabilizar → COBRO_PERIODO_NO_ABIERTO', async () => {
      const { cobro } = await service.crear(tenantA, USER_ID, inputCobro());
      await prisma.periodoFiscal.update({
        where: { id: periodoJulio },
        data: { status: PeriodoFiscalStatus.CERRADO },
      });

      await expect(service.contabilizar(tenantA, cobro.id, USER_ID)).rejects.toMatchObject({
        code: 'COBRO_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
    });
  });

  describe('contabilizar (D-11: serie I del tipo INGRESO)', () => {
    it('primer cobro del mes → I2607-000001, comprobante CONTABILIZADO', async () => {
      const { comprobanteId, numero } = await crearCobroContabilizado();
      expect(numero).toBe('I2607-000001');

      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante).toMatchObject({
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'I2607-000001',
        anulado: false,
      });
    });

    it('contabilizar dos veces → COBRO_NO_ES_BORRADOR (409), el número no se re-emite', async () => {
      const { cobroId, numero } = await crearCobroContabilizado();

      await expect(service.contabilizar(tenantA, cobroId, USER_ID)).rejects.toMatchObject({
        code: 'COBRO_NO_ES_BORRADOR',
        httpStatus: 409,
      });
      expect(numero).toBe('I2607-000001');
    });

    it('cobro ajeno → COBRO_NO_ENCONTRADO (404, no 403)', async () => {
      const { cobro } = await service.crear(tenantA, USER_ID, inputCobro());

      await expect(service.contabilizar(tenantB, cobro.id, USER_ID)).rejects.toMatchObject({
        code: 'COBRO_NO_ENCONTRADO',
        httpStatus: 404,
      });
    });
  });

  describe('eliminarBorrador', () => {
    it('borra el cobro y su comprobante por el camino de sistema', async () => {
      const { cobro } = await service.crear(tenantA, USER_ID, inputCobro());

      await service.eliminarBorrador(tenantA, cobro.id, USER_ID);

      await expect(contarDelTenant()).resolves.toEqual({
        cobros: 0,
        comprobantes: 0,
        aplicaciones: 0,
      });
    });

    it('un cobro CONTABILIZADO no se borra → COBRO_NO_ES_BORRADOR y todo sobrevive', async () => {
      const { cobroId } = await crearCobroContabilizado();

      await expect(service.eliminarBorrador(tenantA, cobroId, USER_ID)).rejects.toMatchObject({
        code: 'COBRO_NO_ES_BORRADOR',
        httpStatus: 409,
      });
      await expect(contarDelTenant()).resolves.toMatchObject({ cobros: 1, comprobantes: 1 });
    });
  });

  describe('aplicaciones (REQ-CXC-03/04/08, D-03)', () => {
    it('aplica cobro→venta sin escribir NINGÚN comprobante nuevo', async () => {
      const { cobroId } = await crearCobroContabilizado('500.00');
      const venta = await crearVentaContabilizada({ montoTotal: '1000.00' });

      const app = await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '400.00',
      });

      expect(app.organizationId).toBe(tenantA);
      expect(app.montoAplicado.toString()).toBe('400');
      // 1 del cobro + 1 de la venta fabricada: aplicar no agregó ninguno.
      await expect(prisma.comprobante.count({ where: { organizationId: tenantA } })).resolves.toBe(
        2,
      );
    });

    it('criterio de éxito 4: el comprobante del cobro queda BYTE-IDÉNTICO tras crear, editar y borrar aplicaciones', async () => {
      const { cobroId, comprobanteId } = await crearCobroContabilizado('500.00');
      const venta = await crearVentaContabilizada({ montoTotal: '1000.00' });
      const antes = await comprobanteDb(comprobanteId);

      const app = await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '400.00',
      });
      await service.editarMontoAplicacion(tenantA, cobroId, app.id, USER_ID, '100.00');
      await service.eliminarAplicacion(tenantA, cobroId, app.id, USER_ID);

      // TODAS las columnas, updatedAt y líneas incluidos: cualquier toque al
      // comprobante durante la re-imputación rompe acá (D-03).
      const despues = await comprobanteDb(comprobanteId);
      expect(despues).toEqual(antes);
    });

    it('REQ-CXC-03/09: aplicar contra un cobro de un período CERRADO (comprobante BLOQUEADO) procede', async () => {
      const { cobroId, comprobanteId } = await crearCobroContabilizado('500.00');
      const venta = await crearVentaContabilizada({
        montoTotal: '1000.00',
        estado: EstadoComprobante.BLOQUEADO,
      });
      // El cierre mensual: período CERRADO y sus comprobantes BLOQUEADOS.
      await prisma.periodoFiscal.update({
        where: { id: periodoJulio },
        data: { status: PeriodoFiscalStatus.CERRADO },
      });
      await runner.run({ userId: USER_ID }, (tx) =>
        tx.comprobante.update({
          where: { id: comprobanteId },
          data: { estado: EstadoComprobante.BLOQUEADO },
        }),
      );

      const app = await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '400.00',
      });

      expect(app.montoAplicado.toString()).toBe('400');
      // El comprobante del cobro no se tocó: sigue BLOQUEADO, mismo número.
      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante).toMatchObject({
        estado: EstadoComprobante.BLOQUEADO,
        numero: 'I2607-000001',
      });
    });

    it('aplicar sobre un cobro en BORRADOR → APLICACION_PUNTA_NO_CONTABILIZADA y nada se escribe', async () => {
      const { cobro } = await service.crear(tenantA, USER_ID, inputCobro());
      const venta = await crearVentaContabilizada({ montoTotal: '1000.00' });

      await expect(
        service.crearAplicacion(tenantA, USER_ID, {
          cobroId: cobro.id,
          ventaId: venta.id,
          montoAplicado: '100.00',
        }),
      ).rejects.toMatchObject({
        code: 'APLICACION_PUNTA_NO_CONTABILIZADA',
        httpStatus: 422,
        details: expect.objectContaining({ punta: 'cobro', estado: 'BORRADOR' }),
      });
      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 0 });
    });

    it('task 0: aplicar a una venta CONTADO CONTABILIZADA → APLICACION_VENTA_CONTADO y nada se escribe', async () => {
      // El guard viejo (solo estado del comprobante) dejaba pasar este caso:
      // la CONTADO está contabilizada pero no integra la cartera (D-04) —
      // aplicarle consume saldo del cobro sin cancelar ninguna deuda visible.
      const { cobroId } = await crearCobroContabilizado('500.00');
      const ventaContado = await crearVentaContabilizada({
        montoTotal: '1000.00',
        condicionPago: CondicionPago.CONTADO,
      });

      await expect(
        service.crearAplicacion(tenantA, USER_ID, {
          cobroId,
          ventaId: ventaContado.id,
          montoAplicado: '100.00',
        }),
      ).rejects.toMatchObject({ code: 'APLICACION_VENTA_CONTADO', httpStatus: 422 });
      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 0 });
    });

    it('REQ-CXC-08: aplicar a una venta de OTRO tenant → 404 APLICACION_VENTA_NO_ENCONTRADA y nada se escribe', async () => {
      const { cobroId } = await crearCobroContabilizado('500.00');
      const ventaB = await crearVentaContabilizada({ tenantId: tenantB, montoTotal: '1000.00' });

      await expect(
        service.crearAplicacion(tenantA, USER_ID, {
          cobroId,
          ventaId: ventaB.id,
          montoAplicado: '100.00',
        }),
      ).rejects.toMatchObject({ code: 'APLICACION_VENTA_NO_ENCONTRADA', httpStatus: 404 });
      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 0 });
      await expect(
        prisma.aplicacionCobro.count({ where: { organizationId: tenantB } }),
      ).resolves.toBe(0);
    });

    it('cobro y venta de contactos distintos → APLICACION_CONTACTO_DISTINTO (422)', async () => {
      const { cobroId } = await crearCobroContabilizado('500.00');
      const ventaDeOtro = await crearVentaContabilizada({
        contactoId: contactoA2,
        montoTotal: '1000.00',
      });

      await expect(
        service.crearAplicacion(tenantA, USER_ID, {
          cobroId,
          ventaId: ventaDeOtro.id,
          montoAplicado: '100.00',
        }),
      ).rejects.toMatchObject({ code: 'APLICACION_CONTACTO_DISTINTO', httpStatus: 422 });
    });

    it('escenario de la spec: cobro de 500 con 400 aplicados, aplicar 200 más → APLICACION_EXCEDE_COBRO', async () => {
      const { cobroId } = await crearCobroContabilizado('500.00');
      const venta = await crearVentaContabilizada({ montoTotal: '1000.00' });
      await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '400.00',
      });

      await expect(
        service.crearAplicacion(tenantA, USER_ID, {
          cobroId,
          ventaId: venta.id,
          montoAplicado: '200.00',
        }),
      ).rejects.toMatchObject({ code: 'APLICACION_EXCEDE_COBRO', httpStatus: 422 });
      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 1 });
    });

    it('exceder la venta → APLICACION_EXCEDE_VENTA (422)', async () => {
      const { cobroId } = await crearCobroContabilizado('500.00');
      const venta = await crearVentaContabilizada({ montoTotal: '300.00' });

      await expect(
        service.crearAplicacion(tenantA, USER_ID, {
          cobroId,
          ventaId: venta.id,
          montoAplicado: '400.00',
        }),
      ).rejects.toMatchObject({ code: 'APLICACION_EXCEDE_VENTA', httpStatus: 422 });
    });

    it('concurrencia (REQ-CXC-04): dos aplicaciones de 300 sobre un cobro de 500 — exactamente una gana', async () => {
      const { cobroId } = await crearCobroContabilizado('500.00');
      const venta = await crearVentaContabilizada({ montoTotal: '1000.00' });

      const [r1, r2] = await Promise.allSettled([
        service.crearAplicacion(tenantA, USER_ID, {
          cobroId,
          ventaId: venta.id,
          montoAplicado: '300.00',
        }),
        service.crearAplicacion(tenantA, USER_ID, {
          cobroId,
          ventaId: venta.id,
          montoAplicado: '300.00',
        }),
      ]);

      const estados = [r1.status, r2.status].sort();
      expect(estados).toEqual(['fulfilled', 'rejected']);
      const rechazo = [r1, r2].find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rechazo.reason).toMatchObject({ code: 'APLICACION_EXCEDE_COBRO' });
      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 1 });
    });

    it('editar el monto re-evalúa el invariante con la fila excluida y persiste el nuevo monto', async () => {
      const { cobroId } = await crearCobroContabilizado('500.00');
      const venta = await crearVentaContabilizada({ montoTotal: '1000.00' });
      const app = await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '300.00',
      });

      await service.editarMontoAplicacion(tenantA, cobroId, app.id, USER_ID, '450.00');
      const editada = await prisma.aplicacionCobro.findFirstOrThrow({
        where: { id: app.id, organizationId: tenantA },
      });
      expect(editada.montoAplicado.toString()).toBe('450');

      // 450 ya aplicados en esta MISMA fila no cuentan contra sí mismos, pero
      // 600 sí excede el cobro de 500.
      await expect(
        service.editarMontoAplicacion(tenantA, cobroId, app.id, USER_ID, '600.00'),
      ).rejects.toMatchObject({ code: 'APLICACION_EXCEDE_COBRO', httpStatus: 422 });
    });

    it('eliminar la aplicación la borra físicamente SIN rastro (no es desvinculación forzada)', async () => {
      const { cobroId } = await crearCobroContabilizado('500.00');
      const venta = await crearVentaContabilizada({ montoTotal: '1000.00' });
      const app = await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '300.00',
      });

      await service.eliminarAplicacion(tenantA, cobroId, app.id, USER_ID);

      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 0 });
      await expect(
        prisma.aplicacionCobroDesvinculada.count({ where: { organizationId: tenantA } }),
      ).resolves.toBe(0);
    });
  });

  describe('editar (REQ-CXC-06, matriz filas 7, 8 y 12)', () => {
    it('subir el monto de un CONTABILIZADO regenera las líneas y CONSERVA el número (§4.9)', async () => {
      const { cobroId, comprobanteId, numero } = await crearCobroContabilizado('500.00');

      await service.editar(tenantA, cobroId, USER_ID, inputCobro({ monto: '800.00' }));

      const cobroDb = await prisma.cobro.findFirstOrThrow({
        where: { id: cobroId, organizationId: tenantA },
      });
      expect(cobroDb.monto.toString()).toBe('800');

      const comprobante = await comprobanteDb(comprobanteId);
      // El correlativo es INMUTABLE desde la primera contabilización (§4.9).
      expect(comprobante).toMatchObject({
        numero,
        estado: EstadoComprobante.CONTABILIZADO,
        anulado: false,
      });
      // El asiento sigue al documento: Debe caja 800 / Haber CxC 800.
      expect(comprobante.lineas).toHaveLength(2);
      expect(comprobante.lineas[0]?.debitoBob.toString()).toBe('800');
      expect(comprobante.lineas[1]?.creditoBob.toString()).toBe('800');
    });

    it('bajar por debajo de lo aplicado → COBRO_MONTO_INFERIOR_APLICADO y NADA cambia (fila 8)', async () => {
      const { cobroId, comprobanteId } = await crearCobroContabilizado('1000.00');
      const venta = await crearVentaContabilizada({ montoTotal: '1000.00' });
      await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '800.00',
      });
      const antes = await comprobanteDb(comprobanteId);

      await expect(
        service.editar(tenantA, cobroId, USER_ID, inputCobro({ monto: '500.00' })),
      ).rejects.toMatchObject({
        code: 'COBRO_MONTO_INFERIOR_APLICADO',
        httpStatus: 422,
        details: expect.objectContaining({ montoADesaplicarBob: '300.00' }),
      });

      const cobroDb = await prisma.cobro.findFirstOrThrow({
        where: { id: cobroId, organizationId: tenantA },
      });
      expect(cobroDb.monto.toString()).toBe('1000');
      await expect(comprobanteDb(comprobanteId)).resolves.toEqual(antes);
      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 1 });
    });

    it('cambiar el contacto desvincula TODAS las aplicaciones con rastro y regenera con el contacto nuevo (fila 12)', async () => {
      const { cobroId, comprobanteId } = await crearCobroContabilizado('1000.00');
      const venta1 = await crearVentaContabilizada({ montoTotal: '1000.00' });
      const venta2 = await crearVentaContabilizada({ montoTotal: '500.00' });
      await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta1.id,
        montoAplicado: '600.00',
      });
      await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta2.id,
        montoAplicado: '300.00',
      });

      await service.editar(tenantA, cobroId, USER_ID, inputCobro({ contactoId: contactoA2 }));

      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 0 });
      const rastro = await prisma.aplicacionCobroDesvinculada.findMany({
        where: { organizationId: tenantA },
      });
      expect(rastro).toHaveLength(2);
      rastro.forEach((fila) => {
        expect(fila.motivo).toBe('Cambio del cliente del cobro');
        expect(fila.userId).toBe(USER_ID);
      });

      // B-1: el contacto viaja en las líneas — regeneradas con el nuevo.
      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante.lineas[0]?.contactoId).toBe(contactoA2);
      expect(comprobante.lineas[1]?.contactoId).toBe(contactoA2);
      expect(comprobante.glosa).toContain('Granja Norte');
    });
  });

  describe('anular (REQ-CXC-06 fila 9, §4.7, B-14, D-13)', () => {
    const MOTIVO = 'Cobro duplicado por error de carga';

    it('escenario de la spec: anular un cobro aplicado reabre la venta por derivación pura', async () => {
      const { cobroId, comprobanteId, numero } = await crearCobroContabilizado('600.00');
      const venta = await crearVentaContabilizada({ montoTotal: '600.00' });
      await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '600.00',
      });
      const ventaAntes = await prisma.venta.findFirstOrThrow({
        where: { id: venta.id, organizationId: tenantA },
      });

      await service.anular(tenantA, cobroId, USER_ID, MOTIVO);

      // Las aplicaciones se eliminan con rastro B-14 (motivo compuesto).
      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 0 });
      const rastro = await prisma.aplicacionCobroDesvinculada.findMany({
        where: { organizationId: tenantA },
      });
      expect(rastro).toHaveLength(1);
      expect(rastro[0]).toMatchObject({
        cobroId,
        ventaId: venta.id,
        motivo: `Anulación del cobro: ${MOTIVO}`,
        userId: USER_ID,
      });
      expect(rastro[0]?.montoAplicado.toString()).toBe('600');

      // §4.7: anulado por flag, número conservado, el comprobante se preserva.
      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante).toMatchObject({
        anulado: true,
        numero,
        motivoAnulacion: MOTIVO,
        anuladoPorUserId: USER_ID,
      });

      // La venta vuelve a leerse ABIERTA con saldo 600 SIN que ninguna
      // columna suya haya cambiado (derivación pura).
      const ventaDespues = await prisma.venta.findFirstOrThrow({
        where: { id: venta.id, organizationId: tenantA },
      });
      expect(ventaDespues).toEqual(ventaAntes);
      const cartera = await new PrismaCarteraReaderAdapter(
        prisma as unknown as PrismaService,
      ).listarVentasDeCartera(tenantA, contactoA);
      const fila = cartera.find((v) => v.ventaId === venta.id);
      expect(fila?.totalAplicado.toString()).toBe('0');
      expect(fila?.montoTotal.toString()).toBe('600');
    });

    it('motivo de menos de 10 caracteres significativos → rechaza SIN haber tocado ninguna aplicación (§4.7)', async () => {
      const { cobroId, comprobanteId } = await crearCobroContabilizado('600.00');
      const venta = await crearVentaContabilizada({ montoTotal: '600.00' });
      await service.crearAplicacion(tenantA, USER_ID, {
        cobroId,
        ventaId: venta.id,
        montoAplicado: '600.00',
      });

      await expect(service.anular(tenantA, cobroId, USER_ID, 'corto')).rejects.toMatchObject({
        httpStatus: 422,
      });

      // El rechazo del writer salió ANTES de desvincular: todo intacto.
      await expect(contarDelTenant()).resolves.toMatchObject({ aplicaciones: 1 });
      await expect(
        prisma.aplicacionCobroDesvinculada.count({ where: { organizationId: tenantA } }),
      ).resolves.toBe(0);
      await expect(comprobanteDb(comprobanteId)).resolves.toMatchObject({ anulado: false });
    });

    it('anular dos veces → COBRO_ANULADO_NO_EDITABLE (409): la anulación es terminal', async () => {
      const { cobroId } = await crearCobroContabilizado('600.00');
      await service.anular(tenantA, cobroId, USER_ID, MOTIVO);

      await expect(service.anular(tenantA, cobroId, USER_ID, MOTIVO)).rejects.toMatchObject({
        code: 'COBRO_ANULADO_NO_EDITABLE',
        httpStatus: 409,
      });
    });

    it('D-13 (en positivo): anular un cobro ya depositado vía TRASPASO procede — el desfase lo destapa el arqueo', async () => {
      const { cobroId, comprobanteId } = await crearCobroContabilizado('500.00');
      // El importe ya salió de Caja hacia el banco por un TRASPASO manual:
      // Caja queda en 0 y anular el cobro la dejará con saldo acreedor.
      const cuentaBanco = (
        await crearCuenta(tenantA, '1.1.1.002', 'BANCO NACIONAL', ClaseCuenta.ACTIVO)
      ).id;
      await runner.run({ userId: USER_ID }, (tx) =>
        tx.comprobante.create({
          data: {
            organizationId: tenantA,
            tipo: TipoComprobante.TRASPASO,
            estado: EstadoComprobante.CONTABILIZADO,
            numero: 'T2607-000001',
            fechaContable: new Date('2026-07-16'),
            periodoFiscalId: periodoJulio,
            glosa: 'Depósito de la recaudación en el banco',
            createdByUserId: USER_ID,
            lineas: {
              create: [
                {
                  organizationId: tenantA,
                  orden: 1,
                  cuentaId: cuentaBanco,
                  moneda: 'BOB',
                  debito: new Prisma.Decimal('500.00'),
                  credito: new Prisma.Decimal('0'),
                  tipoCambio: new Prisma.Decimal('1'),
                  debitoBob: new Prisma.Decimal('500.00'),
                  creditoBob: new Prisma.Decimal('0'),
                },
                {
                  organizationId: tenantA,
                  orden: 2,
                  cuentaId: cuentaCaja,
                  moneda: 'BOB',
                  debito: new Prisma.Decimal('0'),
                  credito: new Prisma.Decimal('500.00'),
                  tipoCambio: new Prisma.Decimal('1'),
                  debitoBob: new Prisma.Decimal('0'),
                  creditoBob: new Prisma.Decimal('500.00'),
                },
              ],
            },
          },
        }),
      );

      // Sin guard de saldo de Caja: la anulación procede igual (D-13).
      await service.anular(tenantA, cobroId, USER_ID, MOTIVO);

      await expect(comprobanteDb(comprobanteId)).resolves.toMatchObject({ anulado: true });
    });
  });
});
