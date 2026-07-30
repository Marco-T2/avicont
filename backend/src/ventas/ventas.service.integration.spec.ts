import {
  ClaseCuenta,
  CondicionPago,
  EstadoComprobante,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
  TipoItem,
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
import { PrismaItemsReaderAdapter } from '@/items/adapters/prisma-items-reader.adapter';
import { PrismaPeriodosReaderAdapter } from '@/periodos-fiscales/adapters/prisma-periodos-reader.adapter';

import { PrismaVentaRepository } from './adapters/prisma-venta.repository';
import { PrismaVentaSnapshotsReaderAdapter } from './adapters/prisma-venta-snapshots-reader.adapter';
import { PrismaVentasConfigReaderAdapter } from './adapters/prisma-ventas-config-reader.adapter';
import { type CrearVentaInput, VentasService } from './ventas.service';

/**
 * Integration del alta y del borrado de borradores de venta, de punta a punta
 * contra Postgres real: valida lo que SOLO la base puede contestar —
 * atomicidad de la TX única (REQ-VTA-01), el actor en `comprobantes_audit`
 * (§4.3), el period lock sobre períodos reales (REQ-VTA-09) y el aislamiento
 * multi-tenant (REQ-VTA-08).
 *
 * §11.3: la suite corre contra la MISMA base de desarrollo — TODA aserción de
 * conteo va acotada a los tenants que este test crea.
 */
describe('VentasService (integration)', () => {
  const SLUG_A = 'org-test-ventas-service-a';
  const SLUG_B = 'org-test-ventas-service-b';
  const USER_ID = 'user-seed-ventas-service';

  let prisma: PrismaClient;
  let runner: AuditedTransactionRunner;
  let service: VentasService;
  let comprobantesService: ComprobantesService;
  let tenantA: string;
  let tenantB: string;
  let contactoA: string;
  let contactoA2: string;
  let contactoB: string;
  let itemConCuenta: string;
  let itemSinCuenta: string;
  let itemConCuentaInactiva: string;
  let itemDeB: string;
  let cuentaVentas: string;
  let cuentaServicios: string;
  let cuentaCaja: string;
  let cuentaCxc: string;
  let cuentaGasto: string;
  let cuentaCajaB: string;
  let periodoJulio: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    const comprobanteRepo = new PrismaComprobanteRepository(prismaService);
    runner = new AuditedTransactionRunner(prismaService);

    // ComprobantesService REAL: contabilizarSistema/anularSistema delegan en
    // contabilizarEnTx/anularEnTx — el MISMO núcleo del camino de usuario, no
    // una copia. Las dependencias que esos núcleos no alcanzan van como stubs
    // que REVIENTAN si algo las toca (delatan un cambio de alcance, no lo
    // esconden). Que el ALTA no pase por estos núcleos lo fija el unit spec.
    const explotaSiSeLlama = (nombre: string) => () => {
      throw new Error(`${nombre} no debe alcanzarse desde el camino de sistema de ventas`);
    };
    comprobantesService = new ComprobantesService(
      comprobanteRepo,
      new PrismaPeriodosReaderAdapter(prismaService),
      new PrismaCuentasReaderAdapter(prismaService),
      new PrismaContactosReaderAdapter(prismaService),
      new SystemClockAdapter(),
      new PrismaSecuenciaComprobanteAdapter(prismaService),
      // documentosFisicosReader: solo se alcanza con asociaciones (acá no hay).
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

    service = new VentasService(
      new PrismaVentaRepository(prismaService),
      writer,
      new PrismaItemsReaderAdapter(prismaService),
      new PrismaContactosReaderAdapter(prismaService),
      new PrismaCuentasEfectivoReaderAdapter(prismaService),
      new PrismaCuentasReaderAdapter(prismaService),
      new PrismaPeriodosReaderAdapter(prismaService),
      new PrismaVentasConfigReaderAdapter(prismaService),
      new PrismaVentaSnapshotsReaderAdapter(prismaService),
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
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A ventas service' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B ventas service' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    contactoA = (await crearContacto(tenantA, 'Avícola Sur')).id;
    contactoA2 = (await crearContacto(tenantA, 'Granja Norte')).id;
    contactoB = (await crearContacto(tenantB, 'Cliente ajeno')).id;

    cuentaVentas = (await crearCuenta(tenantA, '4.1.1.001', 'VENTAS', ClaseCuenta.INGRESO)).id;
    cuentaServicios = (
      await crearCuenta(tenantA, '4.1.2.001', 'VENTA DE SERVICIOS', ClaseCuenta.INGRESO)
    ).id;
    cuentaCaja = (await crearCuenta(tenantA, '1.1.1.001', 'CAJA GENERAL', ClaseCuenta.ACTIVO)).id;
    cuentaCxc = (
      await crearCuenta(tenantA, '1.1.2.001', 'CUENTAS POR COBRAR', ClaseCuenta.ACTIVO, {
        requiereContacto: true,
      })
    ).id;
    cuentaGasto = (await crearCuenta(tenantA, '5.1.1.001', 'GASTOS GENERALES', ClaseCuenta.EGRESO))
      .id;
    cuentaCajaB = (await crearCuenta(tenantB, '1.1.1.001', 'CAJA B', ClaseCuenta.ACTIVO)).id;

    const cuentaInactiva = await crearCuenta(
      tenantA,
      '4.1.3.001',
      'INGRESO INACTIVO',
      ClaseCuenta.INGRESO,
      { activa: false },
    );

    itemConCuenta = (await crearItem(tenantA, 'Pollo entero', cuentaServicios)).id;
    itemSinCuenta = (await crearItem(tenantA, 'Flete', null)).id;
    itemConCuentaInactiva = (await crearItem(tenantA, 'Ítem roto', cuentaInactiva.id)).id;
    itemDeB = (await crearItem(tenantB, 'Ítem ajeno', null)).id;

    await prisma.orgConfiguracionContable.create({
      data: { organizationId: tenantA, cuentasPorCobrarId: cuentaCxc, ventasId: cuentaVentas },
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
    // Mayo ABIERTO como segundo mes editable: mover una venta a un mes FUTURO
    // lo bloquea el core (`FechaFuturaNoPermitidaError`), así que el destino
    // del test de "conserva el número" tiene que ser un mes pasado.
    await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantA,
        gestionId: gestion.id,
        year: 2026,
        month: 5,
        ordenEnGestion: 5,
      },
    });
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
      // auditada, la conexión del pool queda con los GUC `app.audit_*` en ''
      // (set_config local revierte al valor de sesión, que nunca existió) y el
      // trigger revienta con 22P02 al castear ''::boolean fuera de una TX
      // auditada. Es fail-closed a favor del sistema; acá solo lo respetamos.
      await runner.run({ userId: USER_ID }, async (tx) => {
        await tx.venta.deleteMany({ where: { organizationId: { in: orgIds } } });
        await tx.cobro.deleteMany({ where: { organizationId: { in: orgIds } } });
        await tx.comprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      });
      // La tabla de auditoría es raw (sin FK): higiene para corridas repetidas.
      await prisma.$executeRaw`DELETE FROM comprobantes_audit WHERE organization_id::text = ANY(${orgIds})`;
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  function crearContacto(organizationId: string, razonSocial: string) {
    return prisma.contacto.create({
      data: { organizationId, razonSocial, esCliente: true, createdByUserId: USER_ID },
    });
  }

  function crearItem(organizationId: string, nombre: string, cuentaIngresoId: string | null) {
    return prisma.item.create({
      data: {
        organizationId,
        nombre,
        tipo: TipoItem.PRODUCTO,
        createdByUserId: USER_ID,
        ...(cuentaIngresoId !== null ? { cuentaIngresoId } : {}),
      },
    });
  }

  function crearCuenta(
    organizationId: string,
    codigoInterno: string,
    nombre: string,
    claseCuenta: ClaseCuenta,
    over: { requiereContacto?: boolean; activa?: boolean } = {},
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
            : claseCuenta === ClaseCuenta.EGRESO
              ? NaturalezaCuenta.DEUDORA
              : NaturalezaCuenta.DEUDORA,
        nivel: 3,
        esDetalle: true,
        ...over,
      },
    });
  }

  function inputContado(over: Partial<CrearVentaInput> = {}): CrearVentaInput {
    return {
      contactoId: contactoA,
      fechaContable: '2026-07-15',
      condicionPago: 'CONTADO',
      glosa: 'entrega en planta',
      cuentaDestinoId: cuentaCaja,
      lineas: [
        {
          itemId: itemConCuenta,
          descripcion: 'Pollo entero',
          cantidad: '5',
          precioUnitario: '6.305',
        },
      ],
      ...over,
    };
  }

  async function contarDelTenant() {
    const [ventas, comprobantes] = await Promise.all([
      prisma.venta.count({ where: { organizationId: tenantA } }),
      prisma.comprobante.count({ where: { organizationId: tenantA } }),
    ]);
    return { ventas, comprobantes };
  }

  describe('crear — alta de punta a punta (REQ-VTA-01/02/03/04)', () => {
    it('CONTADO: persiste venta + líneas + comprobante BORRADOR de sistema en UNA transacción', async () => {
      const { venta, comprobanteId } = await service.crear(tenantA, USER_ID, inputContado());

      const ventaDb = await prisma.venta.findFirstOrThrow({
        where: { id: venta.id, organizationId: tenantA },
        include: { lineas: true },
      });
      expect(ventaDb.montoTotal.toString()).toBe('31.53');
      expect(ventaDb.lineas).toHaveLength(1);
      expect(ventaDb.lineas[0]).toMatchObject({
        organizationId: tenantA,
        itemId: itemConCuenta,
        cuentaIngresoId: cuentaServicios,
        descripcion: 'Pollo entero',
      });
      expect(ventaDb.lineas[0]?.subtotal.toString()).toBe('31.53');

      const comprobante = await prisma.comprobante.findFirstOrThrow({
        where: { id: comprobanteId, organizationId: tenantA },
        include: { lineas: { orderBy: { orden: 'asc' } } },
      });
      expect(comprobante).toMatchObject({
        estado: EstadoComprobante.BORRADOR,
        generadoPorSistema: true,
        tipo: TipoComprobante.VENTA,
        origenTipo: 'VENTA',
        origenId: venta.id,
        numero: null,
        anulado: false,
      });
      // Q-2: la glosa se sostiene sola — operación + cliente, no "Venta #id".
      expect(comprobante.glosa).toContain('Venta al contado');
      expect(comprobante.glosa).toContain('Avícola Sur');
      expect(comprobante.glosa).not.toMatch(/^Venta #\S+$/);

      expect(comprobante.lineas).toHaveLength(2);
      expect(comprobante.lineas[0]).toMatchObject({ cuentaId: cuentaCaja, contactoId: contactoA });
      expect(comprobante.lineas[0]?.debitoBob.toString()).toBe('31.53');
      expect(comprobante.lineas[1]).toMatchObject({
        cuentaId: cuentaServicios,
        glosaLinea: 'Pollo entero',
      });
      expect(comprobante.lineas[1]?.creditoBob.toString()).toBe('31.53');
    });

    it('la escritura corre en la TX AUDITADA: comprobantes_audit registra el actor (§4.3)', async () => {
      const { comprobanteId } = await service.crear(tenantA, USER_ID, inputContado());

      const auditorias = await prisma.$queryRaw<
        { usuario_id: string | null; operacion: string }[]
      >`SELECT usuario_id, operacion FROM comprobantes_audit
        WHERE comprobante_id = ${comprobanteId}::uuid AND tabla = 'comprobantes'`;

      expect(auditorias.length).toBeGreaterThan(0);
      // Escribir fuera de auditedTx.run grabaría usuario_id NULL — en silencio.
      auditorias.forEach((fila) => {
        expect(fila.usuario_id).toBe(USER_ID);
      });
    });

    it('CREDITO: debita CxC con el contacto (B-1), persiste el vencimiento y respeta el fallback ventasId', async () => {
      const { venta, comprobanteId } = await service.crear(
        tenantA,
        USER_ID,
        inputContado({
          condicionPago: 'CREDITO',
          fechaVencimiento: '2026-08-15',
          lineas: [
            { itemId: itemSinCuenta, descripcion: 'Flete', cantidad: '1', precioUnitario: '50' },
          ],
        }),
      );

      const ventaDb = await prisma.venta.findFirstOrThrow({
        where: { id: venta.id, organizationId: tenantA },
        include: { lineas: true },
      });
      expect(ventaDb.fechaVencimiento?.toISOString()).toContain('2026-08-15');
      // Snapshot resuelto al CREAR: el ítem no trae cuenta → concepto ventasId.
      expect(ventaDb.lineas[0]?.cuentaIngresoId).toBe(cuentaVentas);

      const comprobante = await prisma.comprobante.findFirstOrThrow({
        where: { id: comprobanteId, organizationId: tenantA },
        include: { lineas: { orderBy: { orden: 'asc' } } },
      });
      expect(comprobante.lineas[0]).toMatchObject({ cuentaId: cuentaCxc, contactoId: contactoA });
      expect(comprobante.glosa).toContain('Venta a crédito');
    });

    it('si el comprobante falla, la venta NO queda persistida (misma TX): cuenta snapshot inactiva', async () => {
      await expect(
        service.crear(
          tenantA,
          USER_ID,
          inputContado({
            lineas: [
              {
                itemId: itemConCuentaInactiva,
                descripcion: 'Ítem roto',
                cantidad: '1',
                precioUnitario: '10',
              },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: 'COMPROBANTE_CUENTA_INACTIVA' });

      await expect(contarDelTenant()).resolves.toEqual({ ventas: 0, comprobantes: 0 });
    });

    it('CONTADO contra una cuenta de gasto activa y de detalle → VENTA_CUENTA_DESTINO_NO_ELEGIBLE', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputContado({ cuentaDestinoId: cuentaGasto })),
      ).rejects.toMatchObject({ code: 'VENTA_CUENTA_DESTINO_NO_ELEGIBLE', httpStatus: 422 });

      await expect(contarDelTenant()).resolves.toEqual({ ventas: 0, comprobantes: 0 });
    });

    it('org con ventasId sin mapear e ítem sin cuenta → VENTA_CONCEPTO_NO_CONFIGURADO nombrando el concepto', async () => {
      await prisma.orgConfiguracionContable.update({
        where: { organizationId: tenantA },
        data: { ventasId: null },
      });

      await expect(
        service.crear(
          tenantA,
          USER_ID,
          inputContado({
            lineas: [
              { itemId: itemSinCuenta, descripcion: 'Flete', cantidad: '1', precioUnitario: '50' },
            ],
          }),
        ),
      ).rejects.toMatchObject({
        code: 'VENTA_CONCEPTO_NO_CONFIGURADO',
        details: { concepto: 'ventasId' },
      });

      await expect(contarDelTenant()).resolves.toEqual({ ventas: 0, comprobantes: 0 });
    });
  });

  describe('period lock (REQ-VTA-09) sobre períodos reales', () => {
    it('período CERRADO → VENTA_PERIODO_NO_ABIERTO y NADA persiste', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputContado({ fechaContable: '2026-06-15' })),
      ).rejects.toMatchObject({ code: 'VENTA_PERIODO_NO_ABIERTO', httpStatus: 409 });

      await expect(contarDelTenant()).resolves.toEqual({ ventas: 0, comprobantes: 0 });
    });

    it('fecha sin período (gestión inexistente) → VENTA_GESTION_NO_ABIERTA', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputContado({ fechaContable: '2025-03-15' })),
      ).rejects.toMatchObject({ code: 'VENTA_GESTION_NO_ABIERTA', httpStatus: 422 });
    });
  });

  describe('multi-tenant estricto (REQ-VTA-08)', () => {
    it('contacto de otro tenant → VENTA_CONTACTO_NO_ENCONTRADO (404, no 403)', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputContado({ contactoId: contactoB })),
      ).rejects.toMatchObject({ code: 'VENTA_CONTACTO_NO_ENCONTRADO', httpStatus: 404 });
    });

    it('ítem de otro tenant → VENTA_ITEM_NO_ENCONTRADO (404)', async () => {
      await expect(
        service.crear(
          tenantA,
          USER_ID,
          inputContado({
            lineas: [
              { itemId: itemDeB, descripcion: 'Ajeno', cantidad: '1', precioUnitario: '10' },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: 'VENTA_ITEM_NO_ENCONTRADO', httpStatus: 404 });
    });

    it('cuenta destino de otro tenant → VENTA_CUENTA_DESTINO_NO_ELEGIBLE (no revela existencia)', async () => {
      await expect(
        service.crear(tenantA, USER_ID, inputContado({ cuentaDestinoId: cuentaCajaB })),
      ).rejects.toMatchObject({ code: 'VENTA_CUENTA_DESTINO_NO_ELEGIBLE', httpStatus: 422 });
    });

    it('eliminar una venta desde otro tenant → VENTA_NO_ENCONTRADA y la venta sobrevive', async () => {
      const { venta } = await service.crear(tenantA, USER_ID, inputContado());

      await expect(service.eliminarBorrador(tenantB, venta.id, USER_ID)).rejects.toMatchObject({
        code: 'VENTA_NO_ENCONTRADA',
        httpStatus: 404,
      });
      await expect(contarDelTenant()).resolves.toEqual({ ventas: 1, comprobantes: 1 });
    });
  });

  describe('eliminarBorrador (REQ-VTA-01)', () => {
    it('borra la venta, sus líneas y su comprobante por el camino de sistema', async () => {
      const { venta, comprobanteId } = await service.crear(tenantA, USER_ID, inputContado());

      await service.eliminarBorrador(tenantA, venta.id, USER_ID);

      await expect(contarDelTenant()).resolves.toEqual({ ventas: 0, comprobantes: 0 });
      await expect(
        prisma.lineaVenta.count({ where: { organizationId: tenantA, ventaId: venta.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.lineaComprobante.count({
          where: { organizationId: tenantA, comprobanteId },
        }),
      ).resolves.toBe(0);
    });
  });

  // ============================================================
  // Helpers de 4.5–4.7 (contabilizar / editar / anular)
  // ============================================================

  function comprobanteDb(comprobanteId: string) {
    return prisma.comprobante.findFirstOrThrow({
      where: { id: comprobanteId, organizationId: tenantA },
      include: { lineas: { orderBy: { orden: 'asc' } } },
    });
  }

  /**
   * Cobro + aplicación fabricados directo en BD (el CRUD de aplicaciones es
   * Fase 5). `createdAt` explícito porque el LIFO se define por él.
   */
  async function aplicarCobro(ventaId: string, monto: string, createdAt: Date) {
    const cobro = await prisma.cobro.create({
      data: {
        organizationId: tenantA,
        contactoId: contactoA,
        fechaContable: new Date('2026-07-20'),
        monto: new Prisma.Decimal(monto),
        cuentaDestinoId: cuentaCaja,
        glosa: 'Cobro de prueba',
        createdByUserId: USER_ID,
      },
    });
    return prisma.aplicacionCobro.create({
      data: {
        organizationId: tenantA,
        cobroId: cobro.id,
        ventaId,
        montoAplicado: new Prisma.Decimal(monto),
        createdAt,
        createdByUserId: USER_ID,
      },
    });
  }

  async function crearContabilizada(over: Partial<CrearVentaInput> = {}) {
    const creada = await service.crear(tenantA, USER_ID, inputContado(over));
    const { numero } = await service.contabilizar(tenantA, creada.venta.id, USER_ID);
    return { ventaId: creada.venta.id, comprobanteId: creada.comprobanteId, numero };
  }

  function lineaInput(cantidad: string, precioUnitario: string) {
    return {
      itemId: itemConCuenta,
      descripcion: 'Pollo entero',
      cantidad,
      precioUnitario,
    };
  }

  describe('contabilizar (REQ-VTA-05)', () => {
    it('primera venta del mes → V2607-000001, y un INGRESO del mismo mes usa SU serie I sin interferencia', async () => {
      const { comprobanteId, numero } = await crearContabilizada();
      expect(numero).toBe('V2607-000001');

      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante).toMatchObject({
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'V2607-000001',
        anulado: false,
      });

      // Un INGRESO manual contabilizado el mismo día arranca SU serie en
      // 000001: las secuencias son por (tenant, tipo, año, mes). El INSERT va
      // DENTRO del runner: los triggers de comprobantes_audit leen el actor de
      // los GUC app.audit_* y fuera de una TX auditada revientan con 22P02.
      const ingreso = await runner.run({ userId: USER_ID }, (tx) =>
        tx.comprobante.create({
          data: {
            organizationId: tenantA,
            tipo: TipoComprobante.INGRESO,
            fechaContable: new Date('2026-07-15'),
            periodoFiscalId: periodoJulio,
            glosa: 'Ingreso manual del contador',
            createdByUserId: USER_ID,
            lineas: {
              create: [
                {
                  organizationId: tenantA,
                  orden: 1,
                  cuentaId: cuentaCaja,
                  moneda: Moneda.BOB,
                  debito: new Prisma.Decimal('100.00'),
                  credito: new Prisma.Decimal('0'),
                  tipoCambio: new Prisma.Decimal('1'),
                  debitoBob: new Prisma.Decimal('100.00'),
                  creditoBob: new Prisma.Decimal('0'),
                },
                {
                  organizationId: tenantA,
                  orden: 2,
                  cuentaId: cuentaVentas,
                  moneda: Moneda.BOB,
                  debito: new Prisma.Decimal('0'),
                  credito: new Prisma.Decimal('100.00'),
                  tipoCambio: new Prisma.Decimal('1'),
                  debitoBob: new Prisma.Decimal('0'),
                  creditoBob: new Prisma.Decimal('100.00'),
                },
              ],
            },
          },
        }),
      );
      const ingresoContabilizado = await runner.run({ userId: USER_ID }, (tx) =>
        comprobantesService.contabilizarEnTx(tenantA, ingreso.id, tx),
      );
      expect(ingresoContabilizado.numero).toBe('I2607-000001');

      // Y la segunda venta sigue la serie V donde iba.
      const segunda = await crearContabilizada();
      expect(segunda.numero).toBe('V2607-000002');
    });

    it('RE-VALIDA el snapshot: cuenta desactivada después del borrador → VENTA_CUENTA_SNAPSHOT_INACTIVA nombrando la cuenta', async () => {
      const { venta } = await service.crear(tenantA, USER_ID, inputContado());
      await prisma.cuenta.update({ where: { id: cuentaServicios }, data: { activa: false } });

      await expect(service.contabilizar(tenantA, venta.id, USER_ID)).rejects.toMatchObject({
        code: 'VENTA_CUENTA_SNAPSHOT_INACTIVA',
        httpStatus: 422,
        details: expect.objectContaining({ cuentaId: cuentaServicios, codigoInterno: '4.1.2.001' }),
      });

      // Nada escribió: el comprobante sigue BORRADOR y sin número.
      const comprobante = await prisma.comprobante.findFirstOrThrow({
        where: { organizationId: tenantA, origenTipo: 'VENTA', origenId: venta.id },
      });
      expect(comprobante).toMatchObject({ estado: EstadoComprobante.BORRADOR, numero: null });
    });

    it('CONTADO: la cuenta destino desactivada después del borrador deja de ser elegible → 422', async () => {
      const { venta } = await service.crear(tenantA, USER_ID, inputContado());
      await prisma.cuenta.update({ where: { id: cuentaCaja }, data: { activa: false } });

      await expect(service.contabilizar(tenantA, venta.id, USER_ID)).rejects.toMatchObject({
        code: 'VENTA_CUENTA_DESTINO_NO_ELEGIBLE',
        httpStatus: 422,
      });
    });

    it('período cerrado entre el borrador y el contabilizar → VENTA_PERIODO_NO_ABIERTO (REQ-VTA-09)', async () => {
      const { venta } = await service.crear(tenantA, USER_ID, inputContado());
      await prisma.periodoFiscal.update({
        where: { id: periodoJulio },
        data: { status: PeriodoFiscalStatus.CERRADO },
      });

      await expect(service.contabilizar(tenantA, venta.id, USER_ID)).rejects.toMatchObject({
        code: 'VENTA_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
    });

    it('contabilizar dos veces → VENTA_NO_ES_BORRADOR (409), el número no se re-emite', async () => {
      const { ventaId, numero } = await crearContabilizada();

      await expect(service.contabilizar(tenantA, ventaId, USER_ID)).rejects.toMatchObject({
        code: 'VENTA_NO_ES_BORRADOR',
        httpStatus: 409,
      });
      expect(numero).toBe('V2607-000001');
    });

    it('venta ajena → VENTA_NO_ENCONTRADA (404, no 403)', async () => {
      const { venta } = await service.crear(tenantA, USER_ID, inputContado());

      await expect(service.contabilizar(tenantB, venta.id, USER_ID)).rejects.toMatchObject({
        code: 'VENTA_NO_ENCONTRADA',
        httpStatus: 404,
      });
    });
  });

  describe('editar (REQ-VTA-06)', () => {
    it('regenera el asiento y recalcula montoTotal en la MISMA TX, preservando id y número (§4.3/§4.9)', async () => {
      const { ventaId, comprobanteId } = await crearContabilizada();

      const editada = await service.editar(
        tenantA,
        ventaId,
        USER_ID,
        inputContado({ glosa: 'entrega en granja', lineas: [lineaInput('2', '400')] }),
      );

      expect(editada.venta.id).toBe(ventaId);
      expect(editada.venta.montoTotal.toString()).toBe('800');
      expect(editada.venta.lineas).toHaveLength(1);

      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante.numero).toBe('V2607-000001');
      expect(comprobante.estado).toBe(EstadoComprobante.CONTABILIZADO);
      expect(comprobante.lineas[0]?.debitoBob.toString()).toBe('800');
      expect(comprobante.lineas[1]?.creditoBob.toString()).toBe('800');
    });

    it('flip CREDITO → CONTADO con un cobro aplicado → rechaza y nada se mueve (REQ-VTA-06 fila 7 / REQ-CXC-03)', async () => {
      const creada = await service.crear(
        tenantA,
        USER_ID,
        inputContado({ condicionPago: 'CREDITO', fechaVencimiento: '2026-08-15' }),
      );
      await service.contabilizar(tenantA, creada.venta.id, USER_ID);
      const aplicacion = await aplicarCobro(creada.venta.id, '10.00', new Date('2026-07-21'));

      await expect(
        service.editar(tenantA, creada.venta.id, USER_ID, inputContado()),
      ).rejects.toMatchObject({
        code: 'VENTA_CONDICION_PAGO_CON_APLICACIONES',
        httpStatus: 422,
      });

      // Antes del guard esto pasaba y dejaba el estado que REQ-CXC-03 prohíbe
      // crear: la venta fuera de la cartera (CONTADO) con su aplicación viva,
      // el asiento debitando Caja —dos veces la misma plata— y CERO rastro.
      const venta = await prisma.venta.findUnique({ where: { id: creada.venta.id } });
      expect(venta?.condicionPago).toBe(CondicionPago.CREDITO);

      const comprobante = await comprobanteDb(creada.comprobanteId);
      const debe = comprobante?.lineas.filter((l) => !l.debitoBob.isZero()) ?? [];
      expect(debe).toHaveLength(1);
      expect(debe[0]?.cuentaId).toBe(cuentaCxc);

      const viva = await prisma.aplicacionCobro.findUnique({ where: { id: aplicacion.id } });
      expect(viva).not.toBeNull();
      const rastro = await prisma.aplicacionCobroDesvinculada.count({
        where: { ventaId: creada.venta.id },
      });
      expect(rastro).toBe(0);
    });

    it('mover la fechaContable a otro mes abierto CONSERVA el número con su YYMM original (§4.3)', async () => {
      const { ventaId, comprobanteId } = await crearContabilizada();

      await service.editar(
        tenantA,
        ventaId,
        USER_ID,
        inputContado({ fechaContable: '2026-05-10' }),
      );

      const comprobante = await comprobanteDb(comprobanteId);
      // El número nació en julio (2607) y la venta ahora vive en mayo: el
      // correlativo es inmutable desde la primera contabilización (§4.9).
      expect(comprobante.numero).toBe('V2607-000001');
      expect(comprobante.fechaContable.toISOString().slice(0, 10)).toBe('2026-05-10');
    });

    it('D-28: cambiar la cuenta del ítem en el catálogo NO altera el snapshot al editar la venta', async () => {
      const { ventaId, comprobanteId } = await crearContabilizada();
      // El catálogo cambia DESPUÉS de la venta: el ítem ahora apunta a otra cuenta.
      await prisma.item.update({
        where: { id: itemConCuenta },
        data: { cuentaIngresoId: cuentaVentas },
      });

      await service.editar(
        tenantA,
        ventaId,
        USER_ID,
        inputContado({ lineas: [lineaInput('2', '400')] }),
      );

      // La línea editada conserva la cuenta congelada al CREAR, y el asiento
      // regenerado acredita esa misma cuenta — no la vigente del catálogo.
      const lineasVenta = await prisma.lineaVenta.findMany({
        where: { organizationId: tenantA, ventaId },
      });
      expect(lineasVenta[0]?.cuentaIngresoId).toBe(cuentaServicios);
      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante.lineas.map((l) => l.cuentaId)).toEqual([cuentaCaja, cuentaServicios]);
    });

    it('escenario de la spec: bajar de 1.000 a 800 recorta la aplicación más reciente a 300 (LIFO)', async () => {
      const { ventaId } = await crearContabilizada({ lineas: [lineaInput('1', '1000')] });
      const app1 = await aplicarCobro(ventaId, '500.00', new Date('2026-07-21T10:00:00Z'));
      const app2 = await aplicarCobro(ventaId, '500.00', new Date('2026-07-22T10:00:00Z'));

      await service.editar(
        tenantA,
        ventaId,
        USER_ID,
        inputContado({ lineas: [lineaInput('1', '800')] }),
      );

      const aplicaciones = await prisma.aplicacionCobro.findMany({
        where: { organizationId: tenantA, ventaId },
        orderBy: { createdAt: 'asc' },
      });
      expect(aplicaciones.map((a) => [a.id, a.montoAplicado.toString()])).toEqual([
        [app1.id, '500'],
        [app2.id, '300'],
      ]);
      // El Cobro 2 queda con 200 a favor por DERIVACIÓN (500 − 300 aplicados):
      // su monto no se toca (D-03) y ningún rastro se escribe en un recorte parcial.
      await expect(
        prisma.aplicacionCobroDesvinculada.count({ where: { organizationId: tenantA, ventaId } }),
      ).resolves.toBe(0);
    });

    it('la CASCADA atraviesa aplicaciones: bajar a 300 elimina la más reciente con rastro y recorta la anterior', async () => {
      const { ventaId } = await crearContabilizada({ lineas: [lineaInput('1', '1000')] });
      const app1 = await aplicarCobro(ventaId, '500.00', new Date('2026-07-21T10:00:00Z'));
      const app2 = await aplicarCobro(ventaId, '500.00', new Date('2026-07-22T10:00:00Z'));

      await service.editar(
        tenantA,
        ventaId,
        USER_ID,
        inputContado({ lineas: [lineaInput('1', '300')] }),
      );

      const aplicaciones = await prisma.aplicacionCobro.findMany({
        where: { organizationId: tenantA, ventaId },
      });
      expect(aplicaciones.map((a) => [a.id, a.montoAplicado.toString()])).toEqual([
        [app1.id, '300'],
      ]);
      // La eliminada por el recorte deja su acto en el rastro (B-14).
      const rastro = await prisma.aplicacionCobroDesvinculada.findMany({
        where: { organizationId: tenantA, ventaId },
      });
      expect(rastro).toHaveLength(1);
      expect(rastro[0]).toMatchObject({ cobroId: app2.cobroId, userId: USER_ID });
      expect(rastro[0]?.montoAplicado.toString()).toBe('500');
    });

    it('cambiar el contacto desvincula TODAS las aplicaciones con rastro y el número no cambia (matriz fila 6)', async () => {
      const { ventaId, comprobanteId } = await crearContabilizada({
        lineas: [lineaInput('1', '1000')],
      });
      const app1 = await aplicarCobro(ventaId, '500.00', new Date('2026-07-21T10:00:00Z'));
      const app2 = await aplicarCobro(ventaId, '500.00', new Date('2026-07-22T10:00:00Z'));

      await service.editar(
        tenantA,
        ventaId,
        USER_ID,
        inputContado({ contactoId: contactoA2, lineas: [lineaInput('1', '1000')] }),
      );

      await expect(
        prisma.aplicacionCobro.count({ where: { organizationId: tenantA, ventaId } }),
      ).resolves.toBe(0);
      const rastro = await prisma.aplicacionCobroDesvinculada.findMany({
        where: { organizationId: tenantA, ventaId },
      });
      expect(rastro.map((r) => r.cobroId).sort()).toEqual([app1.cobroId, app2.cobroId].sort());
      // Los cobros sobreviven: quedan con saldo a favor del cliente A por derivación.
      await expect(prisma.cobro.count({ where: { organizationId: tenantA } })).resolves.toBe(2);

      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante.numero).toBe('V2607-000001');
      expect(comprobante.glosa).toContain('Granja Norte');
    });

    it('editar una venta de un período cerrado → VENTA_PERIODO_NO_ABIERTO indicando la reapertura', async () => {
      const { ventaId } = await crearContabilizada();
      await prisma.periodoFiscal.update({
        where: { id: periodoJulio },
        data: { status: PeriodoFiscalStatus.CERRADO },
      });

      const rechazo = service.editar(tenantA, ventaId, USER_ID, inputContado());
      await expect(rechazo).rejects.toMatchObject({
        code: 'VENTA_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
      await rechazo.catch((err: Error) => {
        expect(err.message).toContain('reapertura');
      });
    });

    it('mover la venta HACIA un período cerrado → VENTA_PERIODO_NO_ABIERTO', async () => {
      const { ventaId } = await crearContabilizada();

      await expect(
        service.editar(tenantA, ventaId, USER_ID, inputContado({ fechaContable: '2026-06-15' })),
      ).rejects.toMatchObject({ code: 'VENTA_PERIODO_NO_ABIERTO', httpStatus: 409 });
    });
  });

  describe('anular (REQ-VTA-07, §4.7)', () => {
    const MOTIVO = 'mercadería devuelta por el cliente';

    it('anula por flag preservando comprobante y número, desvincula TODAS las aplicaciones con rastro', async () => {
      const { ventaId, comprobanteId } = await crearContabilizada({
        lineas: [lineaInput('1', '4500')],
      });
      await aplicarCobro(ventaId, '2000.00', new Date('2026-07-21T10:00:00Z'));
      await aplicarCobro(ventaId, '2500.00', new Date('2026-07-22T10:00:00Z'));

      await service.anular(tenantA, ventaId, USER_ID, MOTIVO);

      const comprobante = await comprobanteDb(comprobanteId);
      expect(comprobante).toMatchObject({
        anulado: true,
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'V2607-000001',
        motivoAnulacion: MOTIVO,
        anuladoPorUserId: USER_ID,
      });
      expect(comprobante.fechaAnulacion).not.toBeNull();

      await expect(
        prisma.aplicacionCobro.count({ where: { organizationId: tenantA, ventaId } }),
      ).resolves.toBe(0);
      const rastro = await prisma.aplicacionCobroDesvinculada.findMany({
        where: { organizationId: tenantA, ventaId },
      });
      expect(rastro).toHaveLength(2);
      rastro.forEach((fila) => {
        expect(fila.motivo).toContain(MOTIVO);
        expect(fila.userId).toBe(USER_ID);
      });
      // Los cobros se preservan: su saldo a favor es derivado, no un estado.
      await expect(prisma.cobro.count({ where: { organizationId: tenantA } })).resolves.toBe(2);

      // La venta anulada sale del estado de cuenta (§4.7).
      const repo = new PrismaVentaRepository(prisma as unknown as PrismaService);
      await expect(repo.listarVentasEnCartera(tenantA, contactoA)).resolves.toEqual([]);
    });

    it('motivo de menos de 10 caracteres significativos → 422 y las aplicaciones quedan INTACTAS (§4.7)', async () => {
      const { ventaId } = await crearContabilizada({ lineas: [lineaInput('1', '1000')] });
      await aplicarCobro(ventaId, '500.00', new Date('2026-07-21T10:00:00Z'));

      await expect(service.anular(tenantA, ventaId, USER_ID, 'corto   ')).rejects.toMatchObject({
        code: 'COMPROBANTE_ANULAR_MOTIVO_INVALIDO',
        httpStatus: 422,
      });

      await expect(
        prisma.aplicacionCobro.count({ where: { organizationId: tenantA, ventaId } }),
      ).resolves.toBe(1);
      await expect(
        prisma.aplicacionCobroDesvinculada.count({ where: { organizationId: tenantA, ventaId } }),
      ).resolves.toBe(0);
    });

    it('anular dos veces → VENTA_ANULADA_NO_EDITABLE (409); editarla también rebota', async () => {
      const { ventaId } = await crearContabilizada();
      await service.anular(tenantA, ventaId, USER_ID, MOTIVO);

      await expect(service.anular(tenantA, ventaId, USER_ID, MOTIVO)).rejects.toMatchObject({
        code: 'VENTA_ANULADA_NO_EDITABLE',
        httpStatus: 409,
      });
      await expect(service.editar(tenantA, ventaId, USER_ID, inputContado())).rejects.toMatchObject(
        { code: 'VENTA_ANULADA_NO_EDITABLE', httpStatus: 409 },
      );
    });

    it('anular una venta en BORRADOR no es legal: se elimina, no se anula', async () => {
      const { venta } = await service.crear(tenantA, USER_ID, inputContado());

      await expect(service.anular(tenantA, venta.id, USER_ID, MOTIVO)).rejects.toMatchObject({
        code: 'COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO',
      });
    });

    it('período cerrado → VENTA_PERIODO_NO_ABIERTO: anular exige la reapertura formal (REQ-VTA-09)', async () => {
      const { ventaId } = await crearContabilizada();
      await prisma.periodoFiscal.update({
        where: { id: periodoJulio },
        data: { status: PeriodoFiscalStatus.CERRADO },
      });

      await expect(service.anular(tenantA, ventaId, USER_ID, MOTIVO)).rejects.toMatchObject({
        code: 'VENTA_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
    });
  });
});
