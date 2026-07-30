import {
  ClaseCuenta,
  CondicionPago,
  EstadoComprobante,
  NaturalezaCuenta,
  Prisma,
  PrismaClient,
  TipoComprobante,
  TipoItem,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import type { VentaCreateData } from '../ports/venta.repository.port';
import { PrismaVentaRepository } from './prisma-venta.repository';

/**
 * Integration spec del `PrismaVentaRepository` contra Postgres real.
 * Valida lo que SOLO Postgres puede contestar:
 *   - Multi-tenancy en TODAS las superficies (§4.2 — bug de seguridad).
 *   - `organizationId` PROPIO en cada línea (REQ-VTA-08).
 *   - Reemplazo de líneas en bloque preservando el `id` de la venta (§4.3).
 *   - El vínculo venta↔comprobante por (org, origenTipo='VENTA', origenId).
 *   - Cartera = `estado IN ESTADOS_CONCILIABLES AND anulado = false`
 *     (REQ-VTA-01: cerrar el período NO saca la venta del estado de cuenta).
 *
 * §11.3: la suite corre contra la MISMA base de desarrollo, así que TODA
 * aserción de conteo va acotada a los tenants que este test crea.
 */
describe('PrismaVentaRepository (integration)', () => {
  const SLUG_A = 'org-test-ventas-repo-a';
  const SLUG_B = 'org-test-ventas-repo-b';
  const USER_ID = 'user-seed-ventas-repo';

  let prisma: PrismaClient;
  let repo: PrismaVentaRepository;
  let tenantA: string;
  let tenantB: string;
  let contactoA: string;
  let contactoA2: string;
  let contactoB: string;
  let itemA: string;
  let itemB: string;
  let cuentaIngresoA: string;
  let cuentaIngresoB: string;
  let cuentaDestinoA: string;
  let periodoA: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaVentaRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A ventas repo' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B ventas repo' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    contactoA = (await crearContacto(tenantA, 'Avícola Sur')).id;
    contactoA2 = (await crearContacto(tenantA, 'Granja Norte')).id;
    contactoB = (await crearContacto(tenantB, 'Cliente ajeno')).id;
    itemA = (await crearItem(tenantA, 'Pollo entero')).id;
    itemB = (await crearItem(tenantB, 'Ítem ajeno')).id;
    cuentaIngresoA = (await crearCuenta(tenantA, '4.1.1.001', 'VENTAS')).id;
    cuentaIngresoB = (await crearCuenta(tenantB, '4.1.1.001', 'VENTAS B')).id;
    cuentaDestinoA = (await crearCuenta(tenantA, '1.1.1.001', 'CAJA GENERAL')).id;

    const gestion = await prisma.gestionFiscal.create({
      data: { organizationId: tenantA, year: 2026, mesInicio: 1 },
    });
    periodoA = (
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
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      // Restrict por todos lados: primero lo que referencia (ventas cascadean
      // sus líneas y aplicaciones; comprobantes, sus líneas), después las orgs
      // (que cascadean items, cuentas, contactos, períodos).
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

  function crearItem(organizationId: string, nombre: string) {
    return prisma.item.create({
      data: { organizationId, nombre, tipo: TipoItem.PRODUCTO, createdByUserId: USER_ID },
    });
  }

  function crearCuenta(organizationId: string, codigoInterno: string, nombre: string) {
    return prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre,
        claseCuenta: codigoInterno.startsWith('4') ? ClaseCuenta.INGRESO : ClaseCuenta.ACTIVO,
        naturaleza: codigoInterno.startsWith('4')
          ? NaturalezaCuenta.ACREEDORA
          : NaturalezaCuenta.DEUDORA,
        nivel: 3,
        esDetalle: true,
      },
    });
  }

  const linea = (over: Partial<VentaCreateData['lineas'][number]> = {}) => ({
    itemId: itemA,
    descripcion: 'Pollo entero',
    cantidad: new Prisma.Decimal('5'),
    precioUnitario: new Prisma.Decimal('6.305'),
    cuentaIngresoId: cuentaIngresoA,
    subtotal: new Prisma.Decimal('31.53'),
    ...over,
  });

  const datosBase = (over: Partial<VentaCreateData> = {}): VentaCreateData => ({
    contactoId: contactoA,
    fechaContable: new Date('2026-07-15'),
    condicionPago: CondicionPago.CONTADO,
    fechaVencimiento: null,
    glosa: 'Venta al contado a Avícola Sur',
    cuentaDestinoId: null,
    montoTotal: new Prisma.Decimal('31.53'),
    createdByUserId: USER_ID,
    lineas: [linea()],
    ...over,
  });

  function crearVenta(tenantId: string, over: Partial<VentaCreateData> = {}) {
    return prisma.$transaction((tx) => repo.crear(tenantId, datosBase(over), tx));
  }

  /** Comprobante vinculado por (org, 'VENTA', ventaId) — sin FK, como en producción. */
  function crearComprobanteDeVenta(
    ventaId: string,
    over: Partial<{
      estado: EstadoComprobante;
      anulado: boolean;
      numero: string | null;
      origenTipo: string;
    }> = {},
  ) {
    return prisma.comprobante.create({
      data: {
        organizationId: tenantA,
        tipo: TipoComprobante.VENTA,
        estado: over.estado ?? EstadoComprobante.BORRADOR,
        anulado: over.anulado ?? false,
        numero: over.numero ?? null,
        fechaContable: new Date('2026-07-15'),
        periodoFiscalId: periodoA,
        glosa: 'Comprobante de la venta',
        origenTipo: over.origenTipo ?? 'VENTA',
        origenId: ventaId,
        generadoPorSistema: true,
        createdByUserId: USER_ID,
      },
    });
  }

  async function aplicarCobro(ventaId: string, monto: string, createdAt: Date) {
    const cobro = await prisma.cobro.create({
      data: {
        organizationId: tenantA,
        contactoId: contactoA,
        fechaContable: new Date('2026-07-20'),
        monto: new Prisma.Decimal(monto),
        cuentaDestinoId: cuentaDestinoA,
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

  describe('crear', () => {
    it('persiste la cabecera y las líneas con orden 1..N por posición', async () => {
      const venta = await crearVenta(tenantA, {
        lineas: [linea(), linea({ descripcion: 'Flete', cantidad: new Prisma.Decimal('1') })],
        montoTotal: new Prisma.Decimal('63.06'),
      });

      expect(venta.glosa).toBe('Venta al contado a Avícola Sur');
      expect(venta.montoTotal.toString()).toBe('63.06');
      expect(venta.lineas.map((l) => l.orden)).toEqual([1, 2]);
      expect(venta.lineas.map((l) => l.descripcion)).toEqual(['Pollo entero', 'Flete']);
    });

    it('cada línea lleva organizationId PROPIO, no sólo vía la cabecera (REQ-VTA-08)', async () => {
      const venta = await crearVenta(tenantA);

      const filas = await prisma.lineaVenta.findMany({ where: { ventaId: venta.id } });
      expect(filas).toHaveLength(1);
      expect(filas[0]?.organizationId).toBe(tenantA);
    });

    it('persiste los snapshots sin recortar decimales (§4.5: precio 18,6 / subtotal 18,2)', async () => {
      const venta = await crearVenta(tenantA, {
        lineas: [linea({ precioUnitario: new Prisma.Decimal('6.305001') })],
      });

      expect(venta.lineas[0]?.precioUnitario.toString()).toBe('6.305001');
      expect(venta.lineas[0]?.subtotal.toString()).toBe('31.53');
      expect(venta.lineas[0]?.cuentaIngresoId).toBe(cuentaIngresoA);
    });

    it('guarda una venta a CREDITO con su vencimiento (§4.6, calendario puro)', async () => {
      const venta = await crearVenta(tenantA, {
        condicionPago: CondicionPago.CREDITO,
        fechaVencimiento: new Date('2026-08-15'),
      });

      expect(venta.condicionPago).toBe(CondicionPago.CREDITO);
      expect(venta.fechaVencimiento?.toISOString().slice(0, 10)).toBe('2026-08-15');
    });
  });

  describe('findById', () => {
    it('devuelve la venta con sus líneas ordenadas por orden', async () => {
      const creada = await crearVenta(tenantA, {
        lineas: [linea({ descripcion: 'B' }), linea({ descripcion: 'A' })],
      });

      const venta = await repo.findById(tenantA, creada.id);

      expect(venta?.lineas.map((l) => l.descripcion)).toEqual(['B', 'A']);
    });

    it('no cruza tenants (venta ajena → null → 404, REQ-VTA-08)', async () => {
      const venta = await crearVenta(tenantA);

      await expect(repo.findById(tenantB, venta.id)).resolves.toBeNull();
    });
  });

  describe('reemplazar', () => {
    it('reemplaza las líneas en bloque preservando el id de la venta (§4.3)', async () => {
      const venta = await crearVenta(tenantA, {
        lineas: [linea(), linea({ descripcion: 'Flete' })],
        montoTotal: new Prisma.Decimal('63.06'),
      });
      const idsViejos = venta.lineas.map((l) => l.id);

      const editada = await prisma.$transaction((tx) =>
        repo.reemplazar(
          tenantA,
          venta.id,
          {
            contactoId: contactoA,
            fechaContable: new Date('2026-07-15'),
            condicionPago: CondicionPago.CONTADO,
            fechaVencimiento: null,
            glosa: 'Venta editada',
            cuentaDestinoId: null,
            montoTotal: new Prisma.Decimal('800.00'),
            lineas: [
              linea({
                cantidad: new Prisma.Decimal('2'),
                precioUnitario: new Prisma.Decimal('400'),
                subtotal: new Prisma.Decimal('800.00'),
              }),
            ],
          },
          tx,
        ),
      );

      expect(editada.id).toBe(venta.id);
      expect(editada.glosa).toBe('Venta editada');
      expect(editada.montoTotal.toString()).toBe('800');
      expect(editada.lineas).toHaveLength(1);
      expect(editada.lineas.map((l) => l.orden)).toEqual([1]);
      // Borrado físico + re-insert: las líneas viejas no sobreviven.
      const sobrevivientes = await prisma.lineaVenta.findMany({
        where: { organizationId: tenantA, id: { in: idsViejos } },
      });
      expect(sobrevivientes).toHaveLength(0);
    });

    it('permite cambiar el contacto (D-20: el reemplazo en bloque ES el mecanismo)', async () => {
      const venta = await crearVenta(tenantA);

      const editada = await prisma.$transaction((tx) =>
        repo.reemplazar(
          tenantA,
          venta.id,
          {
            contactoId: contactoA2,
            fechaContable: new Date('2026-07-15'),
            condicionPago: CondicionPago.CONTADO,
            fechaVencimiento: null,
            glosa: 'Venta al contado a Granja Norte',
            cuentaDestinoId: null,
            montoTotal: new Prisma.Decimal('31.53'),
            lineas: [linea()],
          },
          tx,
        ),
      );

      expect(editada.contactoId).toBe(contactoA2);
    });

    it('no cruza tenants: la venta ajena no se toca (§4.2)', async () => {
      const venta = await crearVenta(tenantA);

      await expect(
        prisma.$transaction((tx) =>
          repo.reemplazar(
            tenantB,
            venta.id,
            {
              contactoId: contactoB,
              fechaContable: new Date('2026-07-15'),
              condicionPago: CondicionPago.CONTADO,
              fechaVencimiento: null,
              glosa: 'Intento cross-tenant',
              cuentaDestinoId: null,
              montoTotal: new Prisma.Decimal('1.00'),
              lineas: [
                linea({
                  itemId: itemB,
                  cuentaIngresoId: cuentaIngresoB,
                  subtotal: new Prisma.Decimal('1.00'),
                }),
              ],
            },
            tx,
          ),
        ),
        // P2025 EXACTO ("no existe"), no un throw cualquiera: sin el scope de
        // tenant en el update, esto rebota igual pero por P2002 (colisión de
        // orden con las líneas que el deleteMany scopeado no borró) — un error
        // que le confirma al atacante que la venta ajena EXISTE (Anti-31).
      ).rejects.toMatchObject({ code: 'P2025' });

      const intacta = await repo.findById(tenantA, venta.id);
      expect(intacta?.glosa).toBe('Venta al contado a Avícola Sur');
      expect(intacta?.lineas).toHaveLength(1);
    });
  });

  describe('eliminar', () => {
    it('borra la venta y sus líneas', async () => {
      const venta = await crearVenta(tenantA);

      await prisma.$transaction((tx) => repo.eliminar(tenantA, venta.id, tx));

      await expect(repo.findById(tenantA, venta.id)).resolves.toBeNull();
      const lineas = await prisma.lineaVenta.count({
        where: { organizationId: tenantA, ventaId: venta.id },
      });
      expect(lineas).toBe(0);
    });

    it('no cruza tenants: la venta ajena sobrevive (§4.2)', async () => {
      const venta = await crearVenta(tenantA);

      await expect(
        prisma.$transaction((tx) => repo.eliminar(tenantB, venta.id, tx)),
      ).rejects.toThrow();

      await expect(repo.findById(tenantA, venta.id)).resolves.not.toBeNull();
    });
  });

  describe('listar', () => {
    beforeEach(async () => {
      await crearVenta(tenantA, { fechaContable: new Date('2026-07-10'), glosa: 'Vieja' });
      await crearVenta(tenantA, { fechaContable: new Date('2026-07-20'), glosa: 'Nueva' });
      await crearVenta(tenantA, {
        contactoId: contactoA2,
        fechaContable: new Date('2026-06-05'),
        glosa: 'De junio, Granja Norte',
      });
      await crearVenta(tenantB, {
        contactoId: contactoB,
        glosa: 'De otro tenant',
        lineas: [linea({ itemId: itemB, cuentaIngresoId: cuentaIngresoB })],
      });
    });

    it('sólo ventas del tenant, más recientes primero', async () => {
      const { ventas, total } = await repo.listar(tenantA, {}, { page: 1, limit: 10 });

      expect(total).toBe(3);
      expect(ventas.map((v) => v.glosa)).toEqual(['Nueva', 'Vieja', 'De junio, Granja Norte']);
    });

    it('filtra por contacto', async () => {
      const { ventas } = await repo.listar(
        tenantA,
        { contactoId: contactoA2 },
        { page: 1, limit: 10 },
      );

      expect(ventas.map((v) => v.glosa)).toEqual(['De junio, Granja Norte']);
    });

    it('filtra por rango de fechaContable (límites inclusivos)', async () => {
      const { ventas } = await repo.listar(
        tenantA,
        { fechaDesde: new Date('2026-07-10'), fechaHasta: new Date('2026-07-20') },
        { page: 1, limit: 10 },
      );

      expect(ventas.map((v) => v.glosa)).toEqual(['Nueva', 'Vieja']);
    });

    it('pagina', async () => {
      const { ventas, total } = await repo.listar(tenantA, {}, { page: 2, limit: 2 });

      expect(total).toBe(3);
      expect(ventas).toHaveLength(1);
    });
  });

  describe('obtenerComprobantesDeVentas', () => {
    it('indexa por ventaId el comprobante vinculado por (org, VENTA, origenId)', async () => {
      const venta = await crearVenta(tenantA);
      const comp = await crearComprobanteDeVenta(venta.id, {
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'V2607-000001',
      });

      const mapa = await repo.obtenerComprobantesDeVentas(tenantA, [venta.id]);

      expect(mapa.get(venta.id)).toEqual({
        id: comp.id,
        numero: 'V2607-000001',
        estado: EstadoComprobante.CONTABILIZADO,
        anulado: false,
      });
    });

    it('una venta sin comprobante no aparece en el Map', async () => {
      const venta = await crearVenta(tenantA);

      const mapa = await repo.obtenerComprobantesDeVentas(tenantA, [venta.id]);

      expect(mapa.size).toBe(0);
    });

    it('ignora comprobantes de otro origenTipo con el mismo origenId', async () => {
      const venta = await crearVenta(tenantA);
      await crearComprobanteDeVenta(venta.id, { origenTipo: 'CIERRE_GASTOS' });

      const mapa = await repo.obtenerComprobantesDeVentas(tenantA, [venta.id]);

      expect(mapa.size).toBe(0);
    });

    it('no cruza tenants (§4.2)', async () => {
      const venta = await crearVenta(tenantA);
      await crearComprobanteDeVenta(venta.id, { estado: EstadoComprobante.CONTABILIZADO });

      const mapa = await repo.obtenerComprobantesDeVentas(tenantB, [venta.id]);

      expect(mapa.size).toBe(0);
    });
  });

  describe('listarAplicaciones', () => {
    it('devuelve las aplicaciones en orden LIFO: la más reciente primero (D-21)', async () => {
      const venta = await crearVenta(tenantA, { montoTotal: new Prisma.Decimal('1000.00') });
      await aplicarCobro(venta.id, '500.00', new Date('2026-07-21T10:00:00Z'));
      await aplicarCobro(venta.id, '300.00', new Date('2026-07-22T10:00:00Z'));

      const aplicaciones = await repo.listarAplicaciones(tenantA, venta.id);

      expect(aplicaciones.map((a) => a.montoAplicado.toString())).toEqual(['300', '500']);
      expect(aplicaciones[0]?.cobroId).toBeDefined();
    });

    it('sin aplicaciones devuelve lista vacía', async () => {
      const venta = await crearVenta(tenantA);

      await expect(repo.listarAplicaciones(tenantA, venta.id)).resolves.toEqual([]);
    });

    it('no cruza tenants (§4.2)', async () => {
      const venta = await crearVenta(tenantA);
      await aplicarCobro(venta.id, '100.00', new Date('2026-07-21T10:00:00Z'));

      await expect(repo.listarAplicaciones(tenantB, venta.id)).resolves.toEqual([]);
    });
  });

  describe('listarVentasEnCartera', () => {
    it('incluye la venta CONTABILIZADA no anulada, con lo ya cobrado', async () => {
      const venta = await crearVenta(tenantA, { montoTotal: new Prisma.Decimal('1000.00') });
      await crearComprobanteDeVenta(venta.id, {
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'V2607-000001',
      });
      await aplicarCobro(venta.id, '400.00', new Date('2026-07-21T10:00:00Z'));

      const cartera = await repo.listarVentasEnCartera(tenantA, contactoA);

      expect(cartera).toHaveLength(1);
      expect(cartera[0]?.venta.id).toBe(venta.id);
      expect(cartera[0]?.numero).toBe('V2607-000001');
      expect(cartera[0]?.totalAplicado.toString()).toBe('400');
    });

    // REQ-VTA-01: cerrar el período pasa el comprobante a BLOQUEADO y la venta
    // SIGUE en el estado de cuenta. Filtrar por CONTABILIZADO a secas vaciaría
    // la cartera de cada cliente el día del cierre.
    it('la venta BLOQUEADA por cierre de período SIGUE en cartera (§4.4)', async () => {
      const venta = await crearVenta(tenantA, { montoTotal: new Prisma.Decimal('1000.00') });
      await crearComprobanteDeVenta(venta.id, {
        estado: EstadoComprobante.BLOQUEADO,
        numero: 'V2606-000042',
      });

      const cartera = await repo.listarVentasEnCartera(tenantA, contactoA);

      expect(cartera.map((c) => c.venta.id)).toEqual([venta.id]);
      expect(cartera[0]?.totalAplicado.toString()).toBe('0');
    });

    it('el BORRADOR no integra la cartera (plata no movida)', async () => {
      const venta = await crearVenta(tenantA);
      await crearComprobanteDeVenta(venta.id, { estado: EstadoComprobante.BORRADOR });

      await expect(repo.listarVentasEnCartera(tenantA, contactoA)).resolves.toEqual([]);
    });

    it('la venta anulada sale del estado de cuenta (§4.7)', async () => {
      const venta = await crearVenta(tenantA);
      await crearComprobanteDeVenta(venta.id, {
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'V2607-000002',
        anulado: true,
      });

      await expect(repo.listarVentasEnCartera(tenantA, contactoA)).resolves.toEqual([]);
    });

    // Defense in depth (§4.2): sin el filtro de tenant en la query de VENTAS,
    // este caso filtra la venta de B — la query de comprobantes no lo salva,
    // porque el comprobante colisionado SÍ es del tenant A. Con UUIDs reales la
    // colisión no ocurre sola; el test la fabrica para que la capa se pruebe.
    it('no devuelve ventas ajenas ni con un origenId colisionado en el tenant propio', async () => {
      const ventaB = await prisma.$transaction((tx) =>
        repo.crear(
          tenantB,
          datosBase({
            contactoId: contactoB,
            lineas: [linea({ itemId: itemB, cuentaIngresoId: cuentaIngresoB })],
          }),
          tx,
        ),
      );
      // Comprobante del tenant A que apunta (mal) a la venta del tenant B.
      await crearComprobanteDeVenta(ventaB.id, {
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'V2607-000009',
      });

      await expect(repo.listarVentasEnCartera(tenantA, contactoB)).resolves.toEqual([]);
    });

    it('no mezcla contactos ni tenants (§4.2)', async () => {
      const venta = await crearVenta(tenantA);
      await crearComprobanteDeVenta(venta.id, {
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'V2607-000003',
      });

      await expect(repo.listarVentasEnCartera(tenantA, contactoA2)).resolves.toEqual([]);
      await expect(repo.listarVentasEnCartera(tenantB, contactoA)).resolves.toEqual([]);
    });
  });

  describe('cuentaDestinoId (PA-1)', () => {
    it('crear la persiste y reemplazar la actualiza', async () => {
      const venta = await crearVenta(tenantA, { cuentaDestinoId: cuentaDestinoA });
      expect(venta.cuentaDestinoId).toBe(cuentaDestinoA);

      const editada = await prisma.$transaction((tx) =>
        repo.reemplazar(tenantA, venta.id, { ...datosBase(), cuentaDestinoId: null }, tx),
      );
      expect(editada.cuentaDestinoId).toBeNull();
    });
  });

  describe('actualizarMontoAplicacion (recorte parcial, D-21)', () => {
    it('baja el monto de UNA aplicación sin tocar las demás', async () => {
      const venta = await crearVenta(tenantA, { montoTotal: new Prisma.Decimal('1000.00') });
      const app1 = await aplicarCobro(venta.id, '500.00', new Date('2026-07-21T10:00:00Z'));
      const app2 = await aplicarCobro(venta.id, '500.00', new Date('2026-07-22T10:00:00Z'));

      await prisma.$transaction((tx) =>
        repo.actualizarMontoAplicacion(tenantA, app2.id, new Prisma.Decimal('300.00'), tx),
      );

      const filas = await prisma.aplicacionCobro.findMany({
        where: { organizationId: tenantA, ventaId: venta.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(filas.map((f) => f.montoAplicado.toString())).toEqual(['500', '300']);
      expect(filas[0]?.id).toBe(app1.id);
    });

    it('no cruza tenants: la aplicación ajena rebota con P2025 exacto (§4.2)', async () => {
      const venta = await crearVenta(tenantA, { montoTotal: new Prisma.Decimal('1000.00') });
      const app = await aplicarCobro(venta.id, '500.00', new Date('2026-07-21T10:00:00Z'));

      await expect(
        prisma.$transaction((tx) =>
          repo.actualizarMontoAplicacion(tenantB, app.id, new Prisma.Decimal('1.00'), tx),
        ),
      ).rejects.toMatchObject({ code: 'P2025' });

      const intacta = await prisma.aplicacionCobro.findFirstOrThrow({
        where: { organizationId: tenantA, id: app.id },
      });
      expect(intacta.montoAplicado.toString()).toBe('500');
    });
  });

  describe('eliminarAplicaciones + registrarAplicacionesDesvinculadas (B-14)', () => {
    it('borra físicamente SOLO las indicadas', async () => {
      const venta = await crearVenta(tenantA, { montoTotal: new Prisma.Decimal('1000.00') });
      const app1 = await aplicarCobro(venta.id, '500.00', new Date('2026-07-21T10:00:00Z'));
      const app2 = await aplicarCobro(venta.id, '500.00', new Date('2026-07-22T10:00:00Z'));

      await prisma.$transaction((tx) => repo.eliminarAplicaciones(tenantA, [app2.id], tx));

      const filas = await prisma.aplicacionCobro.findMany({
        where: { organizationId: tenantA, ventaId: venta.id },
      });
      expect(filas.map((f) => f.id)).toEqual([app1.id]);
    });

    it('no cruza tenants: los ids ajenos sobreviven (§4.2)', async () => {
      const venta = await crearVenta(tenantA, { montoTotal: new Prisma.Decimal('1000.00') });
      const app = await aplicarCobro(venta.id, '500.00', new Date('2026-07-21T10:00:00Z'));

      await prisma.$transaction((tx) => repo.eliminarAplicaciones(tenantB, [app.id], tx));

      await expect(
        prisma.aplicacionCobro.count({ where: { organizationId: tenantA, id: app.id } }),
      ).resolves.toBe(1);
    });

    it('registra el rastro append-only con organizationId, monto, motivo y userId', async () => {
      const venta = await crearVenta(tenantA, { montoTotal: new Prisma.Decimal('1000.00') });
      const app = await aplicarCobro(venta.id, '500.00', new Date('2026-07-21T10:00:00Z'));

      await prisma.$transaction((tx) =>
        repo.registrarAplicacionesDesvinculadas(
          tenantA,
          [
            {
              cobroId: app.cobroId,
              ventaId: venta.id,
              montoAplicado: app.montoAplicado,
              motivo: 'Anulación de la venta: mercadería devuelta por el cliente',
              userId: USER_ID,
            },
          ],
          tx,
        ),
      );

      const rastro = await prisma.aplicacionCobroDesvinculada.findMany({
        where: { organizationId: tenantA, ventaId: venta.id },
      });
      expect(rastro).toHaveLength(1);
      expect(rastro[0]).toMatchObject({
        organizationId: tenantA,
        cobroId: app.cobroId,
        ventaId: venta.id,
        motivo: 'Anulación de la venta: mercadería devuelta por el cliente',
        userId: USER_ID,
      });
      expect(rastro[0]?.montoAplicado.toString()).toBe('500');
    });

    it('con lista vacía no escribe nada', async () => {
      const venta = await crearVenta(tenantA);

      await prisma.$transaction((tx) => repo.registrarAplicacionesDesvinculadas(tenantA, [], tx));
      await prisma.$transaction((tx) => repo.eliminarAplicaciones(tenantA, [], tx));

      await expect(
        prisma.aplicacionCobroDesvinculada.count({
          where: { organizationId: tenantA, ventaId: venta.id },
        }),
      ).resolves.toBe(0);
    });
  });
});
