import {
  CondicionPago,
  EstadoComprobante,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaCobroRepository } from './prisma-cobro.repository';

/**
 * Integration spec del `PrismaCobroRepository` contra Postgres real.
 * Valida lo que SOLO Postgres puede contestar:
 *   - Multi-tenancy en TODAS las superficies, incluido el vínculo
 *     cobro→venta (§4.2 / REQ-CXC-08 — bug de seguridad).
 *   - El invariante de sobre-aplicación bajo CONCURRENCIA real: `SUM()`
 *     intra-TX con `FOR UPDATE` sobre cobro y venta (REQ-CXC-04, Anti-11,
 *     Anti-12, cicatriz F-03).
 *   - El vínculo cobro↔comprobante por (org, origenTipo='COBRO', origenId).
 *   - Saldo a favor = `estado IN ESTADOS_CONCILIABLES AND anulado = false`
 *     (REQ-CXC-01/07: cerrar el período NO borra el saldo a favor).
 *
 * §11.3: la suite corre contra la MISMA base de desarrollo, así que TODA
 * aserción de conteo va acotada a los tenants que este test crea.
 */
describe('PrismaCobroRepository (integration)', () => {
  const SLUG_A = 'org-test-cxc-repo-a';
  const SLUG_B = 'org-test-cxc-repo-b';
  const USER_ID = 'user-seed-cxc-repo';

  let prisma: PrismaClient;
  let repo: PrismaCobroRepository;
  let tenantA: string;
  let tenantB: string;
  let contactoA: string;
  let contactoA2: string;
  let contactoB: string;
  let cuentaDestinoA: string;
  let cuentaDestinoB: string;
  let periodoA: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaCobroRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A cxc repo' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B cxc repo' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    contactoA = (await crearContacto(tenantA, 'Avícola Sur')).id;
    contactoA2 = (await crearContacto(tenantA, 'Granja Norte')).id;
    contactoB = (await crearContacto(tenantB, 'Cliente ajeno')).id;
    cuentaDestinoA = (await crearCuenta(tenantA, '1.1.1.001', 'CAJA GENERAL')).id;
    cuentaDestinoB = (await crearCuenta(tenantB, '1.1.1.001', 'CAJA GENERAL B')).id;

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
      // Restrict por todos lados: primero lo que referencia (cobros y ventas
      // cascadean sus aplicaciones y desvinculadas; comprobantes, sus líneas),
      // después las orgs (que cascadean cuentas, contactos, períodos).
      await prisma.cobro.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.venta.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  function crearContacto(organizationId: string, razonSocial: string) {
    return prisma.contacto.create({
      data: { organizationId, razonSocial, esCliente: true, createdByUserId: USER_ID },
    });
  }

  function crearCuenta(organizationId: string, codigoInterno: string, nombre: string) {
    return prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre,
        claseCuenta: 'ACTIVO',
        naturaleza: 'DEUDORA',
        nivel: 3,
        esDetalle: true,
      },
    });
  }

  /** Venta creada directo por Prisma: este módulo NO escribe ventas (§3.3). */
  function crearVenta(
    tenantId: string,
    over: Partial<{ contactoId: string; montoTotal: string }> = {},
  ) {
    return prisma.venta.create({
      data: {
        organizationId: tenantId,
        contactoId: over.contactoId ?? (tenantId === tenantA ? contactoA : contactoB),
        fechaContable: new Date('2026-07-10'),
        condicionPago: CondicionPago.CREDITO,
        fechaVencimiento: new Date('2026-08-10'),
        glosa: 'Venta a crédito de prueba',
        montoTotal: new Prisma.Decimal(over.montoTotal ?? '1000.00'),
        createdByUserId: USER_ID,
      },
    });
  }

  function datosCobro(over: Partial<Parameters<typeof repo.crear>[1]> = {}) {
    return {
      contactoId: contactoA,
      fechaContable: new Date('2026-07-15'),
      monto: new Prisma.Decimal('500.00'),
      cuentaDestinoId: cuentaDestinoA,
      glosa: 'Cobro en efectivo de Avícola Sur',
      createdByUserId: USER_ID,
      ...over,
    };
  }

  function crearCobro(tenantId: string, over: Partial<Parameters<typeof repo.crear>[1]> = {}) {
    return prisma.$transaction((tx) => repo.crear(tenantId, datosCobro(over), tx));
  }

  function aplicar(
    tenantId: string,
    cobroId: string,
    ventaId: string,
    monto: string,
    createdAt?: Date,
  ) {
    return prisma.aplicacionCobro.create({
      data: {
        organizationId: tenantId,
        cobroId,
        ventaId,
        montoAplicado: new Prisma.Decimal(monto),
        ...(createdAt !== undefined ? { createdAt } : {}),
        createdByUserId: USER_ID,
      },
    });
  }

  /** Comprobante vinculado por (org, 'COBRO', origenId) — sin FK, como en producción. */
  function crearComprobanteDeCobro(
    cobroId: string,
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
        tipo: TipoComprobante.INGRESO,
        estado: over.estado ?? EstadoComprobante.BORRADOR,
        anulado: over.anulado ?? false,
        numero: over.numero ?? null,
        fechaContable: new Date('2026-07-15'),
        periodoFiscalId: periodoA,
        glosa: 'Comprobante del cobro',
        origenTipo: over.origenTipo ?? 'COBRO',
        origenId: cobroId,
        generadoPorSistema: true,
        createdByUserId: USER_ID,
      },
    });
  }

  describe('crear', () => {
    it('persiste el cobro con organizationId del tenant', async () => {
      const cobro = await crearCobro(tenantA);

      expect(cobro.organizationId).toBe(tenantA);
      expect(cobro.contactoId).toBe(contactoA);
      expect(cobro.monto.toString()).toBe('500');
      expect(cobro.glosa).toBe('Cobro en efectivo de Avícola Sur');
    });

    it('persiste el monto sin recortar decimales (§4.5)', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('1250.57') });

      expect(cobro.monto.toString()).toBe('1250.57');
    });
  });

  describe('findById', () => {
    it('devuelve el cobro del tenant', async () => {
      const creado = await crearCobro(tenantA);

      const cobro = await repo.findById(tenantA, creado.id);

      expect(cobro?.id).toBe(creado.id);
    });

    it('no cruza tenants (cobro ajeno → null → 404, REQ-CXC-08)', async () => {
      const cobro = await crearCobro(tenantA);

      await expect(repo.findById(tenantB, cobro.id)).resolves.toBeNull();
    });
  });

  describe('actualizar', () => {
    it('actualiza la cabecera completa', async () => {
      const cobro = await crearCobro(tenantA);

      const editado = await prisma.$transaction((tx) =>
        repo.actualizar(
          tenantA,
          cobro.id,
          {
            contactoId: contactoA2,
            fechaContable: new Date('2026-07-16'),
            monto: new Prisma.Decimal('750.00'),
            cuentaDestinoId: cuentaDestinoA,
            glosa: 'Cobro corregido: era de Granja Norte',
          },
          tx,
        ),
      );

      expect(editado.id).toBe(cobro.id);
      expect(editado.contactoId).toBe(contactoA2);
      expect(editado.monto.toString()).toBe('750');
      expect(editado.glosa).toBe('Cobro corregido: era de Granja Norte');
    });

    it('no cruza tenants: el cobro ajeno rebota con P2025 exacto (§4.2)', async () => {
      const cobro = await crearCobro(tenantA);

      await expect(
        prisma.$transaction((tx) =>
          repo.actualizar(
            tenantB,
            cobro.id,
            {
              contactoId: contactoB,
              fechaContable: new Date('2026-07-16'),
              monto: new Prisma.Decimal('1.00'),
              cuentaDestinoId: cuentaDestinoB,
              glosa: 'Intento cross-tenant',
            },
            tx,
          ),
        ),
        // P2025 EXACTO, no un throw cualquiera (lección Fase 4): otro código le
        // confirmaría al atacante que el cobro ajeno EXISTE (Anti-31).
      ).rejects.toMatchObject({ code: 'P2025' });

      const intacto = await repo.findById(tenantA, cobro.id);
      expect(intacto?.monto.toString()).toBe('500');
    });
  });

  describe('listar', () => {
    beforeEach(async () => {
      await crearCobro(tenantA, { fechaContable: new Date('2026-07-10'), glosa: 'Viejo' });
      await crearCobro(tenantA, { fechaContable: new Date('2026-07-20'), glosa: 'Nuevo' });
      await crearCobro(tenantA, {
        contactoId: contactoA2,
        fechaContable: new Date('2026-06-05'),
        glosa: 'De junio, Granja Norte',
      });
      await crearCobro(tenantB, {
        contactoId: contactoB,
        cuentaDestinoId: cuentaDestinoB,
        glosa: 'De otro tenant',
      });
    });

    it('sólo cobros del tenant, más recientes primero', async () => {
      const { cobros, total } = await repo.listar(tenantA, {}, { page: 1, limit: 10 });

      expect(total).toBe(3);
      expect(cobros.map((c) => c.glosa)).toEqual(['Nuevo', 'Viejo', 'De junio, Granja Norte']);
    });

    it('filtra por contacto', async () => {
      const { cobros } = await repo.listar(
        tenantA,
        { contactoId: contactoA2 },
        { page: 1, limit: 10 },
      );

      expect(cobros.map((c) => c.glosa)).toEqual(['De junio, Granja Norte']);
    });

    it('filtra por rango de fechaContable (límites inclusivos)', async () => {
      const { cobros } = await repo.listar(
        tenantA,
        { fechaDesde: new Date('2026-07-10'), fechaHasta: new Date('2026-07-20') },
        { page: 1, limit: 10 },
      );

      expect(cobros.map((c) => c.glosa)).toEqual(['Nuevo', 'Viejo']);
    });

    it('pagina', async () => {
      const { cobros, total } = await repo.listar(tenantA, {}, { page: 2, limit: 2 });

      expect(total).toBe(3);
      expect(cobros).toHaveLength(1);
    });
  });

  describe('obtenerComprobantesDeCobros', () => {
    it('indexa por cobroId el comprobante vinculado por (org, COBRO, origenId)', async () => {
      const cobro = await crearCobro(tenantA);
      const comp = await crearComprobanteDeCobro(cobro.id, {
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'I2607-000001',
      });

      const mapa = await repo.obtenerComprobantesDeCobros(tenantA, [cobro.id]);

      expect(mapa.get(cobro.id)).toEqual({
        id: comp.id,
        numero: 'I2607-000001',
        estado: EstadoComprobante.CONTABILIZADO,
        anulado: false,
      });
    });

    it('ignora comprobantes de otro origenTipo con el mismo origenId', async () => {
      const cobro = await crearCobro(tenantA);
      await crearComprobanteDeCobro(cobro.id, { origenTipo: 'VENTA' });

      const mapa = await repo.obtenerComprobantesDeCobros(tenantA, [cobro.id]);

      expect(mapa.size).toBe(0);
    });

    it('no cruza tenants (§4.2)', async () => {
      const cobro = await crearCobro(tenantA);
      await crearComprobanteDeCobro(cobro.id, { estado: EstadoComprobante.CONTABILIZADO });

      const mapa = await repo.obtenerComprobantesDeCobros(tenantB, [cobro.id]);

      expect(mapa.size).toBe(0);
    });

    it('con lista vacía no consulta y devuelve Map vacío', async () => {
      await expect(repo.obtenerComprobantesDeCobros(tenantA, [])).resolves.toEqual(new Map());
    });
  });

  describe('obtenerComprobantesDeVentas (punta venta de una aplicación)', () => {
    it('indexa por ventaId el comprobante vinculado por (org, VENTA, origenId)', async () => {
      const venta = await crearVenta(tenantA);
      const comp = await crearComprobanteDeCobro(venta.id, {
        origenTipo: 'VENTA',
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

    it('ignora comprobantes de otro origenTipo con el mismo origenId', async () => {
      const venta = await crearVenta(tenantA);
      await crearComprobanteDeCobro(venta.id, { origenTipo: 'COBRO' });

      const mapa = await repo.obtenerComprobantesDeVentas(tenantA, [venta.id]);

      expect(mapa.size).toBe(0);
    });

    it('no cruza tenants (§4.2)', async () => {
      const venta = await crearVenta(tenantA);
      await crearComprobanteDeCobro(venta.id, {
        origenTipo: 'VENTA',
        estado: EstadoComprobante.CONTABILIZADO,
      });

      const mapa = await repo.obtenerComprobantesDeVentas(tenantB, [venta.id]);

      expect(mapa.size).toBe(0);
    });

    it('con lista vacía no consulta y devuelve Map vacío', async () => {
      await expect(repo.obtenerComprobantesDeVentas(tenantA, [])).resolves.toEqual(new Map());
    });
  });

  describe('eliminar (borrador del cobro, REQ-CXC-02)', () => {
    it('borra el cobro del tenant', async () => {
      const cobro = await crearCobro(tenantA);

      await prisma.$transaction((tx) => repo.eliminar(tenantA, cobro.id, tx));

      await expect(repo.findById(tenantA, cobro.id)).resolves.toBeNull();
    });

    it('no cruza tenants: el cobro ajeno rebota con P2025 exacto y sobrevive (§4.2)', async () => {
      const cobro = await crearCobro(tenantA);

      await expect(
        prisma.$transaction((tx) => repo.eliminar(tenantB, cobro.id, tx)),
      ).rejects.toMatchObject({ code: 'P2025' });

      await expect(repo.findById(tenantA, cobro.id)).resolves.not.toBeNull();
    });
  });

  describe('listarAplicacionesDeCobro', () => {
    it('devuelve las aplicaciones del cobro, la más reciente primero', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('1000.00') });
      const venta1 = await crearVenta(tenantA);
      const venta2 = await crearVenta(tenantA);
      await aplicar(tenantA, cobro.id, venta1.id, '400.00', new Date('2026-07-21T10:00:00Z'));
      await aplicar(tenantA, cobro.id, venta2.id, '300.00', new Date('2026-07-22T10:00:00Z'));

      const aplicaciones = await repo.listarAplicacionesDeCobro(tenantA, cobro.id);

      expect(aplicaciones.map((a) => a.montoAplicado.toString())).toEqual(['300', '400']);
      expect(aplicaciones.map((a) => a.ventaId)).toEqual([venta2.id, venta1.id]);
    });

    it('sin aplicaciones devuelve lista vacía', async () => {
      const cobro = await crearCobro(tenantA);

      await expect(repo.listarAplicacionesDeCobro(tenantA, cobro.id)).resolves.toEqual([]);
    });

    it('no cruza tenants (§4.2)', async () => {
      const cobro = await crearCobro(tenantA);
      const venta = await crearVenta(tenantA);
      await aplicar(tenantA, cobro.id, venta.id, '100.00');

      await expect(repo.listarAplicacionesDeCobro(tenantB, cobro.id)).resolves.toEqual([]);
    });
  });

  describe('crearAplicacion (REQ-CXC-08: el vínculo re-verifica las dos puntas)', () => {
    it('crea la aplicación con organizationId propio', async () => {
      const cobro = await crearCobro(tenantA);
      const venta = await crearVenta(tenantA);

      const app = await prisma.$transaction((tx) =>
        repo.crearAplicacion(
          tenantA,
          {
            cobroId: cobro.id,
            ventaId: venta.id,
            montoAplicado: new Prisma.Decimal('300.00'),
            createdByUserId: USER_ID,
          },
          tx,
        ),
      );

      expect(app).not.toBeNull();
      expect(app?.organizationId).toBe(tenantA);
      expect(app?.montoAplicado.toString()).toBe('300');
    });

    // El agujero clásico (REQ-CXC-08): cobro del tenant A aplicado a una venta
    // del tenant B. El repositorio lo corta aunque el service se haya
    // equivocado (defense in depth, §4.2).
    it('venta ajena → null y NADA escrito', async () => {
      const cobro = await crearCobro(tenantA);
      const ventaB = await crearVenta(tenantB, { contactoId: contactoB });

      const app = await prisma.$transaction((tx) =>
        repo.crearAplicacion(
          tenantA,
          {
            cobroId: cobro.id,
            ventaId: ventaB.id,
            montoAplicado: new Prisma.Decimal('300.00'),
            createdByUserId: USER_ID,
          },
          tx,
        ),
      );

      expect(app).toBeNull();
      // Acotado a los DOS tenants del test (§11.3), para probar que no se
      // escribió ni en A ni en B.
      await expect(
        prisma.aplicacionCobro.count({ where: { organizationId: { in: [tenantA, tenantB] } } }),
      ).resolves.toBe(0);
    });

    it('cobro ajeno → null y NADA escrito', async () => {
      const cobroB = await crearCobro(tenantB, {
        contactoId: contactoB,
        cuentaDestinoId: cuentaDestinoB,
      });
      const venta = await crearVenta(tenantA);

      const app = await prisma.$transaction((tx) =>
        repo.crearAplicacion(
          tenantA,
          {
            cobroId: cobroB.id,
            ventaId: venta.id,
            montoAplicado: new Prisma.Decimal('300.00'),
            createdByUserId: USER_ID,
          },
          tx,
        ),
      );

      expect(app).toBeNull();
      await expect(
        prisma.aplicacionCobro.count({ where: { organizationId: { in: [tenantA, tenantB] } } }),
      ).resolves.toBe(0);
    });
  });

  describe('actualizarMontoAplicacion', () => {
    it('edita el monto de UNA aplicación sin tocar las demás', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('1000.00') });
      const venta = await crearVenta(tenantA);
      const app1 = await aplicar(
        tenantA,
        cobro.id,
        venta.id,
        '500.00',
        new Date('2026-07-21T10:00:00Z'),
      );
      const app2 = await aplicar(
        tenantA,
        cobro.id,
        venta.id,
        '400.00',
        new Date('2026-07-22T10:00:00Z'),
      );

      await prisma.$transaction((tx) =>
        repo.actualizarMontoAplicacion(tenantA, app2.id, new Prisma.Decimal('250.00'), tx),
      );

      const filas = await prisma.aplicacionCobro.findMany({
        where: { organizationId: tenantA, cobroId: cobro.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(filas.map((f) => f.montoAplicado.toString())).toEqual(['500', '250']);
      expect(filas[0]?.id).toBe(app1.id);
    });

    it('no cruza tenants: la aplicación ajena rebota con P2025 exacto (§4.2)', async () => {
      const cobro = await crearCobro(tenantA);
      const venta = await crearVenta(tenantA);
      const app = await aplicar(tenantA, cobro.id, venta.id, '300.00');

      await expect(
        prisma.$transaction((tx) =>
          repo.actualizarMontoAplicacion(tenantB, app.id, new Prisma.Decimal('1.00'), tx),
        ),
      ).rejects.toMatchObject({ code: 'P2025' });

      const intacta = await prisma.aplicacionCobro.findFirstOrThrow({
        where: { organizationId: tenantA, id: app.id },
      });
      expect(intacta.montoAplicado.toString()).toBe('300');
    });
  });

  describe('eliminarAplicaciones + registrarAplicacionesDesvinculadas (B-14)', () => {
    it('borra físicamente SOLO las indicadas', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('1000.00') });
      const venta = await crearVenta(tenantA);
      const app1 = await aplicar(
        tenantA,
        cobro.id,
        venta.id,
        '500.00',
        new Date('2026-07-21T10:00:00Z'),
      );
      const app2 = await aplicar(
        tenantA,
        cobro.id,
        venta.id,
        '400.00',
        new Date('2026-07-22T10:00:00Z'),
      );

      await prisma.$transaction((tx) => repo.eliminarAplicaciones(tenantA, [app2.id], tx));

      const filas = await prisma.aplicacionCobro.findMany({
        where: { organizationId: tenantA, cobroId: cobro.id },
      });
      expect(filas.map((f) => f.id)).toEqual([app1.id]);
    });

    it('no cruza tenants: los ids ajenos sobreviven (§4.2)', async () => {
      const cobro = await crearCobro(tenantA);
      const venta = await crearVenta(tenantA);
      const app = await aplicar(tenantA, cobro.id, venta.id, '300.00');

      await prisma.$transaction((tx) => repo.eliminarAplicaciones(tenantB, [app.id], tx));

      await expect(
        prisma.aplicacionCobro.count({ where: { organizationId: tenantA, id: app.id } }),
      ).resolves.toBe(1);
    });

    it('registra el rastro append-only con organizationId, monto, motivo y userId', async () => {
      const cobro = await crearCobro(tenantA);
      const venta = await crearVenta(tenantA);
      const app = await aplicar(tenantA, cobro.id, venta.id, '300.00');

      await prisma.$transaction((tx) =>
        repo.registrarAplicacionesDesvinculadas(
          tenantA,
          [
            {
              cobroId: cobro.id,
              ventaId: venta.id,
              montoAplicado: app.montoAplicado,
              motivo: 'Anulación del cobro: pago registrado dos veces',
              userId: USER_ID,
            },
          ],
          tx,
        ),
      );

      const rastro = await prisma.aplicacionCobroDesvinculada.findMany({
        where: { organizationId: tenantA, cobroId: cobro.id },
      });
      expect(rastro).toHaveLength(1);
      expect(rastro[0]).toMatchObject({
        organizationId: tenantA,
        cobroId: cobro.id,
        ventaId: venta.id,
        motivo: 'Anulación del cobro: pago registrado dos veces',
        userId: USER_ID,
      });
      expect(rastro[0]?.montoAplicado.toString()).toBe('300');
    });

    it('con lista vacía no escribe nada', async () => {
      const cobro = await crearCobro(tenantA);

      await prisma.$transaction((tx) => repo.registrarAplicacionesDesvinculadas(tenantA, [], tx));
      await prisma.$transaction((tx) => repo.eliminarAplicaciones(tenantA, [], tx));

      await expect(
        prisma.aplicacionCobroDesvinculada.count({
          where: { organizationId: tenantA, cobroId: cobro.id },
        }),
      ).resolves.toBe(0);
    });
  });

  describe('obtenerSumasAplicadasConLock (REQ-CXC-04)', () => {
    it('devuelve ambas puntas con sus topes, contactos y sumas', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('500.00') });
      const otroCobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('900.00') });
      const venta = await crearVenta(tenantA, { montoTotal: '1000.00' });
      const otraVenta = await crearVenta(tenantA, { montoTotal: '2000.00' });
      await aplicar(tenantA, cobro.id, otraVenta.id, '150.00'); // suma al cobro, no a la venta
      await aplicar(tenantA, otroCobro.id, venta.id, '700.00'); // suma a la venta, no al cobro
      await aplicar(tenantA, cobro.id, venta.id, '100.00'); // suma a ambos

      const sumas = await prisma.$transaction((tx) =>
        repo.obtenerSumasAplicadasConLock(tenantA, { cobroId: cobro.id, ventaId: venta.id }, tx),
      );

      expect(sumas).not.toBeNull();
      expect(sumas?.cobro).toMatchObject({ id: cobro.id, contactoId: contactoA });
      expect(sumas?.cobro.monto.toString()).toBe('500');
      // La condición de pago viaja EN el snapshot bajo lock: es el dato
      // autoritativo con el que el service rechaza aplicar a una CONTADO
      // (task 0) — una lectura aparte podría ver otra cosa.
      expect(sumas?.venta).toMatchObject({
        id: venta.id,
        contactoId: contactoA,
        condicionPago: CondicionPago.CREDITO,
      });
      expect(sumas?.venta.montoTotal.toString()).toBe('1000');
      expect(sumas?.aplicadoAlCobro.toString()).toBe('250');
      expect(sumas?.aplicadoALaVenta.toString()).toBe('800');
    });

    it('sin aplicaciones las sumas son 0, no null', async () => {
      const cobro = await crearCobro(tenantA);
      const venta = await crearVenta(tenantA);

      const sumas = await prisma.$transaction((tx) =>
        repo.obtenerSumasAplicadasConLock(tenantA, { cobroId: cobro.id, ventaId: venta.id }, tx),
      );

      expect(sumas?.aplicadoAlCobro.toString()).toBe('0');
      expect(sumas?.aplicadoALaVenta.toString()).toBe('0');
    });

    it('excluirAplicacionId deja esa fila fuera de AMBAS sumas (edición)', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('500.00') });
      const venta = await crearVenta(tenantA, { montoTotal: '1000.00' });
      const editada = await aplicar(tenantA, cobro.id, venta.id, '300.00');
      await aplicar(tenantA, cobro.id, venta.id, '100.00');

      const sumas = await prisma.$transaction((tx) =>
        repo.obtenerSumasAplicadasConLock(
          tenantA,
          { cobroId: cobro.id, ventaId: venta.id, excluirAplicacionId: editada.id },
          tx,
        ),
      );

      expect(sumas?.aplicadoAlCobro.toString()).toBe('100');
      expect(sumas?.aplicadoALaVenta.toString()).toBe('100');
    });

    it('cobro ajeno → null (§4.2, se comporta como inexistente)', async () => {
      const cobroB = await crearCobro(tenantB, {
        contactoId: contactoB,
        cuentaDestinoId: cuentaDestinoB,
      });
      const venta = await crearVenta(tenantA);

      await expect(
        prisma.$transaction((tx) =>
          repo.obtenerSumasAplicadasConLock(tenantA, { cobroId: cobroB.id, ventaId: venta.id }, tx),
        ),
      ).resolves.toBeNull();
    });

    it('venta ajena → null (§4.2)', async () => {
      const cobro = await crearCobro(tenantA);
      const ventaB = await crearVenta(tenantB, { contactoId: contactoB });

      await expect(
        prisma.$transaction((tx) =>
          repo.obtenerSumasAplicadasConLock(tenantA, { cobroId: cobro.id, ventaId: ventaB.id }, tx),
        ),
      ).resolves.toBeNull();
    });
  });

  describe('obtenerCobroConAplicadoConLock', () => {
    it('devuelve monto, contacto y suma aplicada del cobro', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('1000.00') });
      const venta = await crearVenta(tenantA);
      await aplicar(tenantA, cobro.id, venta.id, '300.00');
      await aplicar(tenantA, cobro.id, venta.id, '200.00');

      const snapshot = await prisma.$transaction((tx) =>
        repo.obtenerCobroConAplicadoConLock(tenantA, cobro.id, tx),
      );

      expect(snapshot).toMatchObject({ id: cobro.id, contactoId: contactoA });
      expect(snapshot?.monto.toString()).toBe('1000');
      expect(snapshot?.aplicadoAlCobro.toString()).toBe('500');
    });

    it('cobro ajeno → null (§4.2)', async () => {
      const cobro = await crearCobro(tenantA);

      await expect(
        prisma.$transaction((tx) => repo.obtenerCobroConAplicadoConLock(tenantB, cobro.id, tx)),
      ).resolves.toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // REQ-CXC-04 bajo CONCURRENCIA: el test que justifica el diseño entero.
  // Sin FOR UPDATE, ambas TX leen las mismas sumas ANTES de que ninguna
  // escriba, y el `SUM()` intra-TX degenera en check-then-act (F-03).
  //
  // La "decisión" acá es inline (suma + monto ≤ tope) porque la función pura
  // de `domain/sobre-aplicacion.ts` se escribe en paralelo; el reparto real
  // (repo LEE, service DECIDE) no cambia lo que este test prueba: que lo
  // leído bajo lock sigue siendo cierto al escribir.
  //
  // Barrera con timeout: fabrica el solapamiento real de las dos TX. Con los
  // locks puestos, la segunda TX queda BLOQUEADA en el SELECT FOR UPDATE (por
  // eso la barrera no puede ser un await incondicional: sería deadlock) y el
  // race(500ms) deja avanzar a la primera; sin locks (mutante), ambas pasan
  // la barrera con suma 0 y el estado final viola el invariante → el test
  // falla, que es exactamente lo que lo hace discriminante.
  // ────────────────────────────────────────────────────────────────────────
  describe('sobre-aplicación bajo concurrencia (REQ-CXC-04, cicatriz F-03)', () => {
    class ExcedeError extends Error {}

    function barreraDeDos() {
      let llegaron = 0;
      let soltar: () => void = () => undefined;
      const barrera = new Promise<void>((resolve) => {
        soltar = resolve;
      });
      const esperarAlOtro = () => {
        llegaron += 1;
        if (llegaron === 2) soltar();
        return Promise.race([barrera, new Promise<void>((r) => setTimeout(r, 500))]);
      };
      return esperarAlOtro;
    }

    // Las dos aplicaciones van a ventas DISTINTAS a propósito (lección Fase 4:
    // el mutante de UNA capa queda invisible detrás de otra): con la misma
    // venta, su FOR UPDATE serializa igual y ENMASCARA la falta del lock del
    // cobro — verificado, el mutante sobrevivía. Con ventas distintas, solo el
    // lock del COBRO puede serializar.
    it('dos aplicaciones de 300 contra un cobro de 500: exactamente UNA commitea', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('500.00') });
      const venta1 = await crearVenta(tenantA, { montoTotal: '5000.00' });
      const venta2 = await crearVenta(tenantA, { montoTotal: '5000.00' });
      const esperarAlOtro = barreraDeDos();

      const intentarAplicar = (ventaId: string) =>
        prisma.$transaction(async (tx) => {
          const sumas = await repo.obtenerSumasAplicadasConLock(
            tenantA,
            { cobroId: cobro.id, ventaId },
            tx,
          );
          if (!sumas) throw new Error('puntas inexistentes');
          await esperarAlOtro();
          const monto = new Prisma.Decimal('300.00');
          if (sumas.aplicadoAlCobro.add(monto).greaterThan(sumas.cobro.monto)) {
            throw new ExcedeError('excede el cobro');
          }
          await repo.crearAplicacion(
            tenantA,
            {
              cobroId: cobro.id,
              ventaId,
              montoAplicado: monto,
              createdByUserId: USER_ID,
            },
            tx,
          );
        });

      const resultados = await Promise.allSettled([
        intentarAplicar(venta1.id),
        intentarAplicar(venta2.id),
      ]);

      const exitos = resultados.filter((r) => r.status === 'fulfilled');
      const rechazos = resultados.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(exitos).toHaveLength(1);
      expect(rechazos).toHaveLength(1);
      expect(rechazos[0]?.reason).toBeInstanceOf(ExcedeError);

      const suma = await prisma.aplicacionCobro.aggregate({
        where: { organizationId: tenantA, cobroId: cobro.id },
        _sum: { montoAplicado: true },
      });
      // El invariante: Σ aplicado NUNCA supera el monto del cobro.
      expect(suma._sum.montoAplicado?.toString()).toBe('300');
    }, 15000);

    // El lock del COBRO no salva este caso: son dos cobros DISTINTOS contra la
    // misma venta. Solo el FOR UPDATE sobre la VENTA serializa — el mutante
    // que le quita el lock a la venta sobrevive al test anterior y muere acá.
    it('dos cobros distintos de 600 contra una venta de 1000: exactamente UNO commitea', async () => {
      const cobro1 = await crearCobro(tenantA, { monto: new Prisma.Decimal('600.00') });
      const cobro2 = await crearCobro(tenantA, { monto: new Prisma.Decimal('600.00') });
      const venta = await crearVenta(tenantA, { montoTotal: '1000.00' });
      const esperarAlOtro = barreraDeDos();

      const intentarAplicar = (cobroId: string) =>
        prisma.$transaction(async (tx) => {
          const sumas = await repo.obtenerSumasAplicadasConLock(
            tenantA,
            { cobroId, ventaId: venta.id },
            tx,
          );
          if (!sumas) throw new Error('puntas inexistentes');
          await esperarAlOtro();
          const monto = new Prisma.Decimal('600.00');
          if (sumas.aplicadoALaVenta.add(monto).greaterThan(sumas.venta.montoTotal)) {
            throw new ExcedeError('excede la venta');
          }
          await repo.crearAplicacion(
            tenantA,
            { cobroId, ventaId: venta.id, montoAplicado: monto, createdByUserId: USER_ID },
            tx,
          );
        });

      const resultados = await Promise.allSettled([
        intentarAplicar(cobro1.id),
        intentarAplicar(cobro2.id),
      ]);

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);

      const suma = await prisma.aplicacionCobro.aggregate({
        where: { organizationId: tenantA, ventaId: venta.id },
        _sum: { montoAplicado: true },
      });
      expect(suma._sum.montoAplicado?.toString()).toBe('600');
    }, 15000);

    // REQ-CXC-06 fila 8 bajo carrera: bajar el monto del cobro compite con una
    // aplicación nueva. Ambos caminos lockean el cobro PRIMERO, así que se
    // serializan; gane quien gane, el estado final cumple aplicado ≤ monto.
    // El mutante que le quita el FOR UPDATE a obtenerCobroConAplicadoConLock
    // deja pasar a ambos (monto 100 con 500 aplicados) y muere acá.
    it('bajar el monto del cobro compite con aplicar: el estado final nunca viola aplicado ≤ monto', async () => {
      const cobro = await crearCobro(tenantA, { monto: new Prisma.Decimal('1000.00') });
      const venta = await crearVenta(tenantA, { montoTotal: '5000.00' });
      const esperarAlOtro = barreraDeDos();

      const bajarMonto = () =>
        prisma.$transaction(async (tx) => {
          const snapshot = await repo.obtenerCobroConAplicadoConLock(tenantA, cobro.id, tx);
          if (!snapshot) throw new Error('cobro inexistente');
          await esperarAlOtro();
          const nuevoMonto = new Prisma.Decimal('100.00');
          if (snapshot.aplicadoAlCobro.greaterThan(nuevoMonto)) {
            throw new ExcedeError('monto inferior a lo aplicado');
          }
          await repo.actualizar(
            tenantA,
            cobro.id,
            {
              contactoId: contactoA,
              fechaContable: new Date('2026-07-15'),
              monto: nuevoMonto,
              cuentaDestinoId: cuentaDestinoA,
              glosa: 'Cobro corregido a la baja',
            },
            tx,
          );
        });

      const aplicar500 = () =>
        prisma.$transaction(async (tx) => {
          const sumas = await repo.obtenerSumasAplicadasConLock(
            tenantA,
            { cobroId: cobro.id, ventaId: venta.id },
            tx,
          );
          if (!sumas) throw new Error('puntas inexistentes');
          await esperarAlOtro();
          const monto = new Prisma.Decimal('500.00');
          if (sumas.aplicadoAlCobro.add(monto).greaterThan(sumas.cobro.monto)) {
            throw new ExcedeError('excede el cobro');
          }
          await repo.crearAplicacion(
            tenantA,
            {
              cobroId: cobro.id,
              ventaId: venta.id,
              montoAplicado: monto,
              createdByUserId: USER_ID,
            },
            tx,
          );
        });

      const resultados = await Promise.allSettled([bajarMonto(), aplicar500()]);

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);

      const cobroFinal = await prisma.cobro.findFirstOrThrow({
        where: { organizationId: tenantA, id: cobro.id },
      });
      const suma = await prisma.aplicacionCobro.aggregate({
        where: { organizationId: tenantA, cobroId: cobro.id },
        _sum: { montoAplicado: true },
      });
      const aplicado = suma._sum.montoAplicado ?? new Prisma.Decimal(0);
      expect(aplicado.lessThanOrEqualTo(cobroFinal.monto)).toBe(true);
    }, 15000);
  });
});
