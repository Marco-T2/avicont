import {
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import { ORIGEN_TIPO_COBRO, ORIGEN_TIPO_VENTA } from '../ports/comprobante-sistema-writer.port';
import type { ComprobanteCrearSistemaData } from '../ports/comprobante.repository.port';
import { PrismaComprobanteRepository } from './prisma-comprobante.repository';

/**
 * Integration spec de la persistencia del PATH-SISTEMA comercial (tasks.md 2.7).
 *
 * Lo que se prueba acá no se puede probar con mocks: la idempotencia se apoya
 * en el `@@unique(organizationId, origenTipo, origenId)` de Postgres, y el
 * acotamiento de los deletes es una cláusula WHERE. Un mock del repo diría que
 * sí a cualquier cosa.
 *
 * Requiere Postgres en DATABASE_URL (§11.3).
 */
describe('PrismaComprobanteRepository — path-sistema comercial (integration vs Postgres)', () => {
  const SLUG = 'org-test-repo-sistema';
  const SLUG_AJENO = 'org-test-repo-sistema-ajeno';

  let prisma: PrismaClient;
  let repo: PrismaComprobanteRepository;
  let tenantId: string;
  let tenantAjenoId: string;
  let periodoId: string;
  let periodoAjenoId: string;
  let cuentaId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaComprobanteRepository(prisma as never);
  });

  afterAll(async () => {
    await limpiarOrgs();
    await prisma.$disconnect();
  });

  /**
   * Borra las orgs del test en orden de FK. Un `organization.deleteMany` suelto
   * no alcanza: `LineaComprobante → Cuenta` es `onDelete: Restrict`, así que el
   * cascade de la organización puede intentar borrar las cuentas mientras
   * todavía hay líneas apuntándolas. Se borran los comprobantes primero (que
   * arrastran sus líneas en cascada) y recién después la organización.
   */
  async function limpiarOrgs() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG, SLUG_AJENO] } },
      select: { id: true },
    });
    if (orgs.length === 0) return;
    const ids = orgs.map((o) => o.id);
    await prisma.comprobante.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  }

  async function sembrarOrg(slug: string, nombre: string) {
    const org = await prisma.organization.create({ data: { slug, name: nombre } });
    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: org.id,
        year: 2026,
        mesInicio: 7,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: org.id,
        gestionId: gestion.id,
        year: 2026,
        month: 7,
        ordenEnGestion: 7,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    return { orgId: org.id, periodoId: periodo.id };
  }

  beforeEach(async () => {
    await limpiarOrgs();

    const propia = await sembrarOrg(SLUG, 'Org Test Repo Sistema');
    tenantId = propia.orgId;
    periodoId = propia.periodoId;

    const ajena = await sembrarOrg(SLUG_AJENO, 'Org Test Repo Sistema Ajena');
    tenantAjenoId = ajena.orgId;
    periodoAjenoId = ajena.periodoId;

    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1.1.1.001',
        nombre: 'Caja General',
        claseCuenta: 'ACTIVO',
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        activa: true,
        esDetalle: true,
        requiereContacto: false,
        permiteMultiMoneda: false,
      },
    });
    cuentaId = cuenta.id;
  });

  function datosVenta(overrides: Partial<ComprobanteCrearSistemaData> = {}) {
    const uno = new Prisma.Decimal(1);
    const cien = new Prisma.Decimal('100.00');
    const cero = new Prisma.Decimal(0);
    const base: ComprobanteCrearSistemaData = {
      tipo: TipoComprobante.INGRESO,
      fechaContable: new Date(Date.UTC(2026, 6, 15)),
      periodoFiscalId: periodoId,
      glosa: 'Venta 001 al contado',
      monedaPrincipal: Moneda.BOB,
      origenTipo: ORIGEN_TIPO_VENTA,
      origenId: 'venta-uuid-1',
      createdByUserId: 'user-test',
      lineas: [
        {
          orden: 1,
          cuentaId,
          contactoId: null,
          moneda: Moneda.BOB,
          debito: cien,
          credito: cero,
          tipoCambio: uno,
          debitoBob: cien,
          creditoBob: cero,
          glosaLinea: null,
        },
        {
          orden: 2,
          cuentaId,
          contactoId: null,
          moneda: Moneda.BOB,
          debito: cero,
          credito: cien,
          tipoCambio: uno,
          debitoBob: cero,
          creditoBob: cien,
          glosaLinea: null,
        },
      ],
    };
    return { ...base, ...overrides };
  }

  describe('crearBorradorSistemaSiNoExiste', () => {
    it('crea el comprobante marcado como de sistema, con su origen y sus líneas', async () => {
      const { id } = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(tenantId, datosVenta(), tx),
      );

      const persistido = await prisma.comprobante.findUniqueOrThrow({
        where: { id },
        include: { lineas: { orderBy: { orden: 'asc' } } },
      });

      expect(persistido.generadoPorSistema).toBe(true);
      expect(persistido.estado).toBe(EstadoComprobante.BORRADOR);
      expect(persistido.origenTipo).toBe(ORIGEN_TIPO_VENTA);
      expect(persistido.origenId).toBe('venta-uuid-1');
      // El correlativo se asigna al contabilizar, no al crear (§4.9).
      expect(persistido.numero).toBeNull();
      expect(persistido.lineas).toHaveLength(2);
      expect(persistido.lineas[0]?.orden).toBe(1);
    });

    // El escenario de REQ-VTA-04: el generador corre dos veces por retry o
    // re-guardado y NO puede dejar dos asientos para la misma venta.
    it('corriendo dos veces sobre el mismo origen deja UN solo comprobante', async () => {
      const primera = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(tenantId, datosVenta(), tx),
      );
      const segunda = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(tenantId, datosVenta(), tx),
      );

      expect(segunda.id).toBe(primera.id);

      const cuantos = await prisma.comprobante.count({
        where: { organizationId: tenantId, origenTipo: ORIGEN_TIPO_VENTA },
      });
      expect(cuantos).toBe(1);
    });

    // Devolver el existente SIN tocarlo: para cambiarle las líneas está
    // `reemplazarComprobante`. Si la segunda corrida pisara los datos, una
    // regeneración disfrazada de alta borraría la edición del contador.
    it('la segunda corrida no pisa la glosa ni las líneas del existente', async () => {
      const { id } = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(tenantId, datosVenta(), tx),
      );

      await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(
          tenantId,
          datosVenta({ glosa: 'GLOSA PISADA', lineas: [] }),
          tx,
        ),
      );

      const persistido = await prisma.comprobante.findUniqueOrThrow({
        where: { id },
        include: { lineas: true },
      });
      expect(persistido.glosa).toBe('Venta 001 al contado');
      expect(persistido.lineas).toHaveLength(2);
    });

    // Un cobro y una venta pueden compartir el id de origen sin pisarse: la
    // unicidad es del PAR, no del id suelto.
    it('distingue orígenes distintos con el mismo origenId', async () => {
      const venta = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(tenantId, datosVenta({ origenId: 'mismo-id' }), tx),
      );
      const cobro = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(
          tenantId,
          datosVenta({ origenTipo: ORIGEN_TIPO_COBRO, origenId: 'mismo-id' }),
          tx,
        ),
      );

      expect(cobro.id).not.toBe(venta.id);
    });

    // §4.2: la idempotencia es POR TENANT. Si el findUnique no filtrara por
    // organización, la venta de una org devolvería el comprobante de otra.
    it('dos organizaciones pueden tener el mismo origenId sin colisionar', async () => {
      const propia = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(tenantId, datosVenta(), tx),
      );

      const cuentaAjena = await prisma.cuenta.create({
        data: {
          organizationId: tenantAjenoId,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja General',
          claseCuenta: 'ACTIVO',
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          activa: true,
          esDetalle: true,
          requiereContacto: false,
          permiteMultiMoneda: false,
        },
      });

      const ajena = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(
          tenantAjenoId,
          datosVenta({
            periodoFiscalId: periodoAjenoId,
            lineas: datosVenta().lineas.map((l) => ({ ...l, cuentaId: cuentaAjena.id })),
          }),
          tx,
        ),
      );

      expect(ajena.id).not.toBe(propia.id);
      const persistidoAjeno = await prisma.comprobante.findUniqueOrThrow({
        where: { id: ajena.id },
      });
      expect(persistidoAjeno.organizationId).toBe(tenantAjenoId);
    });
  });

  describe('eliminarBorradorSistema', () => {
    async function crearBorradorSistema() {
      const { id } = await prisma.$transaction((tx) =>
        repo.crearBorradorSistemaSiNoExiste(tenantId, datosVenta(), tx),
      );
      return id;
    }

    it('borra el borrador de sistema y sus líneas en cascada', async () => {
      const id = await crearBorradorSistema();

      const borradas = await prisma.$transaction((tx) =>
        repo.eliminarBorradorSistema(tenantId, id, tx),
      );

      expect(borradas).toBe(1);
      expect(await prisma.comprobante.findUnique({ where: { id } })).toBeNull();
      expect(await prisma.lineaComprobante.count({ where: { comprobanteId: id } })).toBe(0);
    });

    // La cláusula que protege al contador: un bug del módulo comercial que
    // pase el id de un comprobante manual no debe poder borrarlo.
    it('NO borra un comprobante manual, aunque esté en BORRADOR', async () => {
      const manual = await prisma.comprobante.create({
        data: {
          organizationId: tenantId,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.BORRADOR,
          fechaContable: new Date(Date.UTC(2026, 6, 15)),
          periodoFiscalId: periodoId,
          glosa: 'Asiento manual del contador',
          monedaPrincipal: Moneda.BOB,
          createdByUserId: 'user-test',
        },
      });

      const borradas = await prisma.$transaction((tx) =>
        repo.eliminarBorradorSistema(tenantId, manual.id, tx),
      );

      expect(borradas).toBe(0);
      expect(await prisma.comprobante.findUnique({ where: { id: manual.id } })).not.toBeNull();
    });

    // Un CONTABILIZADO no se borra: se anula (§4.7). Su número ya fue emitido.
    it('NO borra un comprobante de sistema ya CONTABILIZADO', async () => {
      const id = await crearBorradorSistema();
      await prisma.comprobante.update({
        where: { id },
        data: { estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000001' },
      });

      const borradas = await prisma.$transaction((tx) =>
        repo.eliminarBorradorSistema(tenantId, id, tx),
      );

      expect(borradas).toBe(0);
      expect(await prisma.comprobante.findUnique({ where: { id } })).not.toBeNull();
    });

    it('NO borra el borrador de sistema de otra organización (§4.2)', async () => {
      const id = await crearBorradorSistema();

      const borradas = await prisma.$transaction((tx) =>
        repo.eliminarBorradorSistema(tenantAjenoId, id, tx),
      );

      expect(borradas).toBe(0);
      expect(await prisma.comprobante.findUnique({ where: { id } })).not.toBeNull();
    });
  });
});
