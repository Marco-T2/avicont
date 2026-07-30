import {
  CondicionPago,
  EstadoComprobante,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaCarteraReaderAdapter } from './prisma-cartera-reader.adapter';

/**
 * Integration spec del `PrismaCarteraReaderAdapter` contra Postgres real.
 * Valida el predicado COMPLETO de la cartera (REQ-CXC-01/05/07, REQ-VTA-04):
 *
 *   - CREDITO solamente: la CONTADO del MISMO cliente no se cuela — es la
 *     trampa de la Fase 4 (la línea de débito de una CONTADO también lleva
 *     `contactoId`, así que "filtrar por contacto" pasa en verde y está mal).
 *   - `estado IN ESTADOS_CONCILIABLES` (los DOS): la BLOQUEADA por cierre de
 *     período SIGUE en cartera (§4.4).
 *   - `anulado = false`: la anulada desaparece (§4.7).
 *   - Orden canónico de antigüedad publicado por el backend (REQ-CXC-05).
 *   - Multi-tenant con colisiones FABRICADAS (§4.2): con defense in depth, el
 *     mutante de una capa queda invisible detrás de otra — cada query se
 *     prueba con la colisión que solo ella filtra.
 *
 * §11.3: la suite corre contra la MISMA base de desarrollo, así que TODA
 * aserción va acotada a los tenants que este test crea.
 */
describe('PrismaCarteraReaderAdapter (integration)', () => {
  const SLUG_A = 'org-test-cartera-reader-a';
  const SLUG_B = 'org-test-cartera-reader-b';
  const USER_ID = 'user-seed-cartera-reader';

  let prisma: PrismaClient;
  let reader: PrismaCarteraReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let clienteA: string;
  let clienteA2: string;
  let clienteB: string;
  let cajaA: string;
  let cajaB: string;
  let periodoA: string;
  let periodoB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    reader = new PrismaCarteraReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A cartera reader' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B cartera reader' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    clienteA = (await crearContacto(tenantA, 'Avícola Sur')).id;
    clienteA2 = (await crearContacto(tenantA, 'Granja Norte')).id;
    clienteB = (await crearContacto(tenantB, 'Cliente ajeno')).id;
    cajaA = (await crearCuentaCaja(tenantA)).id;
    cajaB = (await crearCuentaCaja(tenantB)).id;
    periodoA = await crearPeriodo(tenantA);
    periodoB = await crearPeriodo(tenantB);
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      // Restrict por todos lados: primero lo que referencia (ventas y cobros
      // cascadean sus aplicaciones), después las orgs (que cascadean
      // contactos, cuentas y períodos). Molde: prisma-venta.repository spec.
      await prisma.venta.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cobro.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  function crearContacto(organizationId: string, razonSocial: string) {
    return prisma.contacto.create({
      data: { organizationId, razonSocial, esCliente: true, createdByUserId: USER_ID },
    });
  }

  function crearCuentaCaja(organizationId: string) {
    return prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno: '1.1.1.001',
        nombre: 'CAJA GENERAL',
        claseCuenta: 'ACTIVO',
        naturaleza: 'DEUDORA',
        nivel: 3,
        esDetalle: true,
      },
    });
  }

  async function crearPeriodo(organizationId: string) {
    const gestion = await prisma.gestionFiscal.create({
      data: { organizationId, year: 2026, mesInicio: 1 },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: { organizationId, gestionId: gestion.id, year: 2026, month: 7, ordenEnGestion: 7 },
    });
    return periodo.id;
  }

  function crearVenta(
    organizationId: string,
    over: Partial<{
      contactoId: string;
      condicionPago: CondicionPago;
      fechaContable: Date;
      fechaVencimiento: Date | null;
      montoTotal: string;
      createdAt: Date;
    }> = {},
  ) {
    return prisma.venta.create({
      data: {
        organizationId,
        contactoId: over.contactoId ?? clienteA,
        fechaContable: over.fechaContable ?? new Date('2026-07-15'),
        condicionPago: over.condicionPago ?? CondicionPago.CREDITO,
        fechaVencimiento:
          over.fechaVencimiento !== undefined ? over.fechaVencimiento : new Date('2026-08-15'),
        glosa: 'Venta de prueba',
        montoTotal: new Prisma.Decimal(over.montoTotal ?? '1000.00'),
        createdByUserId: USER_ID,
        ...(over.createdAt !== undefined ? { createdAt: over.createdAt } : {}),
      },
    });
  }

  /** Comprobante vinculado por (org, origenTipo, origenId) — sin FK, como en producción. */
  function crearComprobante(
    origenTipo: 'VENTA' | 'COBRO',
    origenId: string,
    over: Partial<{
      organizationId: string;
      periodoFiscalId: string;
      estado: EstadoComprobante;
      anulado: boolean;
    }> = {},
  ) {
    return prisma.comprobante.create({
      data: {
        organizationId: over.organizationId ?? tenantA,
        tipo: origenTipo === 'VENTA' ? TipoComprobante.VENTA : TipoComprobante.INGRESO,
        estado: over.estado ?? EstadoComprobante.CONTABILIZADO,
        anulado: over.anulado ?? false,
        fechaContable: new Date('2026-07-15'),
        periodoFiscalId: over.periodoFiscalId ?? periodoA,
        glosa: 'Comprobante de prueba',
        origenTipo,
        origenId,
        generadoPorSistema: true,
        createdByUserId: USER_ID,
      },
    });
  }

  function crearCobro(
    organizationId: string,
    over: Partial<{
      contactoId: string;
      monto: string;
      cuentaDestinoId: string;
      createdAt: Date;
    }> = {},
  ) {
    return prisma.cobro.create({
      data: {
        organizationId,
        contactoId: over.contactoId ?? clienteA,
        fechaContable: new Date('2026-07-20'),
        monto: new Prisma.Decimal(over.monto ?? '500.00'),
        cuentaDestinoId: over.cuentaDestinoId ?? cajaA,
        glosa: 'Cobro de prueba',
        createdByUserId: USER_ID,
        ...(over.createdAt !== undefined ? { createdAt: over.createdAt } : {}),
      },
    });
  }

  function aplicar(organizationId: string, cobroId: string, ventaId: string, monto: string) {
    return prisma.aplicacionCobro.create({
      data: {
        organizationId,
        cobroId,
        ventaId,
        montoAplicado: new Prisma.Decimal(monto),
        createdByUserId: USER_ID,
      },
    });
  }

  /** CREDITO contabilizada lista para la cartera, en un solo paso. */
  async function ventaEnCartera(
    over: Parameters<typeof crearVenta>[1] = {},
    comp: Parameters<typeof crearComprobante>[2] = {},
  ) {
    const venta = await crearVenta(tenantA, over);
    await crearComprobante('VENTA', venta.id, comp);
    return venta;
  }

  describe('listarVentasDeCartera', () => {
    it('incluye la venta CREDITO contabilizada con su total aplicado agregado', async () => {
      const venta = await ventaEnCartera({ montoTotal: '1000.00' });
      const cobro = await crearCobro(tenantA);
      await aplicar(tenantA, cobro.id, venta.id, '300.00');
      await aplicar(tenantA, cobro.id, venta.id, '100.00');

      const cartera = await reader.listarVentasDeCartera(tenantA, clienteA);

      expect(cartera).toHaveLength(1);
      expect(cartera[0]?.ventaId).toBe(venta.id);
      expect(cartera[0]?.montoTotal.toBob()).toBe('1000.00');
      expect(cartera[0]?.totalAplicado.toBob()).toBe('400.00');
      expect(cartera[0]?.fechaContable.toISOString().slice(0, 10)).toBe('2026-07-15');
      expect(cartera[0]?.fechaVencimiento?.toISOString().slice(0, 10)).toBe('2026-08-15');
      expect(cartera[0]?.createdAt).toBeInstanceOf(Date);
    });

    it('sin aplicaciones el total aplicado es cero', async () => {
      await ventaEnCartera();

      const cartera = await reader.listarVentasDeCartera(tenantA, clienteA);

      expect(cartera).toHaveLength(1);
      expect(cartera[0]?.totalAplicado.isZero()).toBe(true);
    });

    // REQ-VTA-04 / D-04 — la trampa de la Fase 4: la línea de débito de una
    // CONTADO también lleva contactoId, así que una implementación que filtre
    // por contacto a secas devuelve las dos y pasa en verde el resto de la
    // suite. Este caso es el que discrimina.
    it('la venta CONTADO del mismo cliente NO integra la cartera aunque esté contabilizada', async () => {
      const credito = await ventaEnCartera({ montoTotal: '1000.00' });
      const contado = await crearVenta(tenantA, {
        condicionPago: CondicionPago.CONTADO,
        fechaVencimiento: null,
        montoTotal: '750.00',
      });
      await crearComprobante('VENTA', contado.id);

      const cartera = await reader.listarVentasDeCartera(tenantA, clienteA);

      expect(cartera.map((v) => v.ventaId)).toEqual([credito.id]);
    });

    // §4.4: cerrar el período pasa los comprobantes a BLOQUEADO con las deudas
    // intactas. Filtrar por CONTABILIZADO a secas vaciaría el estado de cuenta
    // del cliente el día del cierre mensual.
    it('la venta BLOQUEADA por cierre de período SIGUE en cartera', async () => {
      const venta = await ventaEnCartera({}, { estado: EstadoComprobante.BLOQUEADO });

      const cartera = await reader.listarVentasDeCartera(tenantA, clienteA);

      expect(cartera.map((v) => v.ventaId)).toEqual([venta.id]);
    });

    it('el BORRADOR no integra la cartera (plata no movida)', async () => {
      await ventaEnCartera({}, { estado: EstadoComprobante.BORRADOR });

      await expect(reader.listarVentasDeCartera(tenantA, clienteA)).resolves.toEqual([]);
    });

    it('la venta anulada desaparece del estado de cuenta (§4.7)', async () => {
      await ventaEnCartera({}, { anulado: true });

      await expect(reader.listarVentasDeCartera(tenantA, clienteA)).resolves.toEqual([]);
    });

    it('la venta sin comprobante no aparece', async () => {
      await crearVenta(tenantA);

      await expect(reader.listarVentasDeCartera(tenantA, clienteA)).resolves.toEqual([]);
    });

    it('publica el orden canónico: fechaContable ASC, createdAt ASC, id ASC (REQ-CXC-05)', async () => {
      // Insertadas fuera de orden a propósito: el orden sale del ORDER BY, no
      // del orden físico de inserción.
      const julio = await ventaEnCartera({ fechaContable: new Date('2026-07-01') });
      const junio15Tarde = await ventaEnCartera({
        fechaContable: new Date('2026-06-15'),
        createdAt: new Date('2026-06-15T18:00:00Z'),
      });
      const junio15Maniana = await ventaEnCartera({
        fechaContable: new Date('2026-06-15'),
        createdAt: new Date('2026-06-15T09:00:00Z'),
      });
      const junio01 = await ventaEnCartera({ fechaContable: new Date('2026-06-01') });

      const cartera = await reader.listarVentasDeCartera(tenantA, clienteA);

      expect(cartera.map((v) => v.ventaId)).toEqual([
        junio01.id,
        junio15Maniana.id, // mismo día: la registrada primero es "la más vieja"
        junio15Tarde.id,
        julio.id,
      ]);
    });

    it('con fecha Y createdAt idénticos el id cierra el orden total (determinismo)', async () => {
      const createdAt = new Date('2026-07-10T12:00:00Z');
      const v1 = await ventaEnCartera({ fechaContable: new Date('2026-07-10'), createdAt });
      const v2 = await ventaEnCartera({ fechaContable: new Date('2026-07-10'), createdAt });
      const esperado = [v1.id, v2.id].sort();

      const cartera = await reader.listarVentasDeCartera(tenantA, clienteA);

      expect(cartera.map((v) => v.ventaId)).toEqual(esperado);
    });

    it('no mezcla contactos', async () => {
      await ventaEnCartera();

      await expect(reader.listarVentasDeCartera(tenantA, clienteA2)).resolves.toEqual([]);
    });

    // Defense in depth (§4.2): sin el filtro de tenant en la query de VENTAS,
    // este caso filtra la venta de B — la query de comprobantes no lo salva,
    // porque el comprobante colisionado SÍ es del tenant A. Con UUIDs reales
    // la colisión no ocurre sola; el test la fabrica para probar ESTA capa.
    it('no devuelve la venta ajena aunque un comprobante del tenant propio apunte a ella', async () => {
      const ventaB = await crearVenta(tenantB, { contactoId: clienteB });
      await crearComprobante('VENTA', ventaB.id); // comprobante del tenant A

      await expect(reader.listarVentasDeCartera(tenantA, clienteB)).resolves.toEqual([]);
    });

    // La colisión espejo: sin el filtro de tenant en la query de COMPROBANTES,
    // el comprobante del tenant B "contabiliza" la venta del tenant A — y la
    // query de ventas, scopeada, no lo salva.
    it('no cuenta el comprobante ajeno que apunta a una venta propia', async () => {
      const ventaA = await crearVenta(tenantA);
      await crearComprobante('VENTA', ventaA.id, {
        organizationId: tenantB,
        periodoFiscalId: periodoB,
      });

      await expect(reader.listarVentasDeCartera(tenantA, clienteA)).resolves.toEqual([]);
    });

    // Tercera capa: sin el filtro de tenant en la Σ de aplicaciones, la fila
    // fabricada del tenant B infla lo aplicado de la venta del tenant A.
    it('la aplicación fabricada de otro tenant no infla el total aplicado', async () => {
      const ventaA = await ventaEnCartera({ montoTotal: '1000.00' });
      const cobroB = await crearCobro(tenantB, { contactoId: clienteB, cuentaDestinoId: cajaB });
      await aplicar(tenantB, cobroB.id, ventaA.id, '999.00');

      const cartera = await reader.listarVentasDeCartera(tenantA, clienteA);

      expect(cartera).toHaveLength(1);
      expect(cartera[0]?.totalAplicado.isZero()).toBe(true);
    });

    it('ignora comprobantes de otro origenTipo con el mismo origenId', async () => {
      const venta = await crearVenta(tenantA);
      await crearComprobante('COBRO', venta.id);

      await expect(reader.listarVentasDeCartera(tenantA, clienteA)).resolves.toEqual([]);
    });
  });

  describe('listarCobrosDeContacto', () => {
    /** Cobro contabilizado listo para el estado de cuenta, en un solo paso. */
    async function cobroConciliable(
      over: Parameters<typeof crearCobro>[1] = {},
      comp: Parameters<typeof crearComprobante>[2] = {},
    ) {
      const cobro = await crearCobro(tenantA, over);
      await crearComprobante('COBRO', cobro.id, comp);
      return cobro;
    }

    it('incluye el cobro contabilizado con su total aplicado agregado', async () => {
      const venta = await ventaEnCartera({ montoTotal: '1000.00' });
      const cobro = await cobroConciliable({ monto: '500.00' });
      await aplicar(tenantA, cobro.id, venta.id, '400.00');

      const cobros = await reader.listarCobrosDeContacto(tenantA, clienteA);

      expect(cobros).toHaveLength(1);
      expect(cobros[0]?.cobroId).toBe(cobro.id);
      expect(cobros[0]?.monto.toBob()).toBe('500.00');
      expect(cobros[0]?.totalAplicado.toBob()).toBe('400.00');
    });

    it('sin aplicaciones el total aplicado es cero (anticipo puro)', async () => {
      await cobroConciliable({ monto: '500.00' });

      const cobros = await reader.listarCobrosDeContacto(tenantA, clienteA);

      expect(cobros).toHaveLength(1);
      expect(cobros[0]?.totalAplicado.isZero()).toBe(true);
    });

    it('el cobro BLOQUEADO por cierre de período sigue contando (§4.4)', async () => {
      const cobro = await cobroConciliable({}, { estado: EstadoComprobante.BLOQUEADO });

      const cobros = await reader.listarCobrosDeContacto(tenantA, clienteA);

      expect(cobros.map((c) => c.cobroId)).toEqual([cobro.id]);
    });

    it('el cobro en BORRADOR no otorga saldo a favor (plata no movida)', async () => {
      await cobroConciliable({}, { estado: EstadoComprobante.BORRADOR });

      await expect(reader.listarCobrosDeContacto(tenantA, clienteA)).resolves.toEqual([]);
    });

    it('el cobro anulado no otorga saldo a favor (§4.7)', async () => {
      await cobroConciliable({}, { anulado: true });

      await expect(reader.listarCobrosDeContacto(tenantA, clienteA)).resolves.toEqual([]);
    });

    it('no mezcla contactos ni tenants (§4.2)', async () => {
      await cobroConciliable();

      await expect(reader.listarCobrosDeContacto(tenantA, clienteA2)).resolves.toEqual([]);
      await expect(reader.listarCobrosDeContacto(tenantB, clienteA)).resolves.toEqual([]);
    });

    // Colisión fabricada, espejo de la de ventas: la Σ sin filtro de tenant
    // contaría la aplicación del tenant B sobre el cobro del tenant A.
    it('la aplicación fabricada de otro tenant no infla el total aplicado', async () => {
      const cobroA = await cobroConciliable({ monto: '500.00' });
      const ventaB = await crearVenta(tenantB, { contactoId: clienteB });
      await aplicar(tenantB, cobroA.id, ventaB.id, '400.00');

      const cobros = await reader.listarCobrosDeContacto(tenantA, clienteA);

      expect(cobros).toHaveLength(1);
      expect(cobros[0]?.totalAplicado.isZero()).toBe(true);
    });
  });
});
