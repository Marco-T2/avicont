import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  EstadoComprobante,
  Moneda,
  NaturalezaCuenta,
  SystemRole,
  TipoComprobante,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanupTestData } from './helpers/test-factory';

/**
 * E2E del endpoint GET /api/libros/diario.
 *
 * Cubre:
 *   - REQ-LD-09: 401 sin token, 403 sin permiso
 *   - REQ-LD-01: filtros período y rango, 400 si inválido
 *   - REQ-LD-02: BORRADOR nunca aparece
 *   - REQ-LD-03: anulados excluidos por default, incluibles con toggle
 *   - REQ-LD-06: totalDebeBob === totalHaberBob (partida doble)
 *   - REQ-LD-08: aislamiento multi-tenant (2 tenants)
 *   - REQ-LD-10: 422 cuando se supera el tope
 */
describe('Libro Diario (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  // ============================================================
  // Fixture helpers
  // ============================================================

  async function seedTenant(slug: string) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: {
        email: `owner+${slug}@ld.bo`,
        hashedPassword,
        isEmailVerified: true,
      },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: {
          create: { userId: owner.id, systemRole: SystemRole.OWNER },
        },
      },
    });

    // Gestión 2026 (crea todos los períodos mensuales)
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@ld.bo`, password: 'password123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    const gestRes = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026 });
    expect(gestRes.status).toBe(201);

    // Cuentas de detalle
    const [caja, ventas] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: org.id,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: org.id,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);

    // Obtener periodoId de enero 2026
    const periodo = await prisma.periodoFiscal.findFirstOrThrow({
      where: { organizationId: org.id, year: 2026, month: 1 },
    });

    return {
      token,
      orgId: org.id,
      cajaId: caja.id,
      ventasId: ventas.id,
      periodoEneroId: periodo.id,
    };
  }

  /** Crea un comprobante CONTABILIZADO directamente en BD para los tests E2E. */
  async function crearAsientoContabilizado(
    orgId: string,
    periodoId: string,
    cajaId: string,
    ventasId: string,
    fechaContable: string,
    opts: { anulado?: boolean; numero?: string; estado?: EstadoComprobante } = {},
  ) {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: orgId,
        tipo: TipoComprobante.DIARIO,
        estado: opts.estado ?? EstadoComprobante.CONTABILIZADO,
        numero:
          opts.numero ?? `D2601-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: new Date(`${fechaContable}T00:00:00Z`),
        periodoFiscalId: periodoId,
        glosa: 'Venta de prueba E2E',
        totalDebitoBob: 1000,
        totalCreditoBob: 1000,
        createdByUserId: 'e2e-user',
        anulado: opts.anulado ?? false,
      },
    });
    await prisma.lineaComprobante.createMany({
      data: [
        {
          organizationId: orgId,
          comprobanteId: comp.id,
          orden: 1,
          cuentaId: cajaId,
          moneda: Moneda.BOB,
          debito: 1000,
          credito: 0,
          debitoBob: 1000,
          creditoBob: 0,
        },
        {
          organizationId: orgId,
          comprobanteId: comp.id,
          orden: 2,
          cuentaId: ventasId,
          moneda: Moneda.BOB,
          debito: 0,
          credito: 1000,
          debitoBob: 0,
          creditoBob: 1000,
        },
      ],
    });
    return comp;
  }

  // ============================================================
  // REQ-LD-09: RBAC — 401 y 403
  // ============================================================

  describe('RBAC', () => {
    it('401 sin token de autenticación', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });
      expect(res.status).toBe(401);
    });

    it('403 si el usuario no tiene el permiso contabilidad.libro-diario.read', async () => {
      // Crear org con owner, y luego un miembro con CustomRole que NO incluye
      // contabilidad.libro-diario.read. OWNER/ADMIN tienen todos los permisos;
      // para probar 403 usamos un CustomRole con permisos distintos.
      const { token: ownerToken, orgId } = await seedTenant('org-ld-403');

      const hashedPassword = await bcrypt.hash('password123', 10);
      const memberUser = await prisma.user.create({
        data: { email: 'member-ld@ld.bo', hashedPassword, isEmailVerified: true },
      });
      // CustomRole con permiso de leer asientos pero NO de libro-diario
      const role = await prisma.customRole.create({
        data: {
          organizationId: orgId,
          slug: 'solo-asientos-ld',
          name: 'Solo asientos (sin libro-diario)',
          permissions: ['contabilidad.asientos.read'],
        },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: memberUser.id, customRoleId: role.id },
      });

      // Login del miembro (su JWT no tiene activeTenantId aún — se activa con switch)
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'member-ld@ld.bo', password: 'password123' });
      expect(loginRes.status).toBe(200);
      const memberToken = loginRes.body.accessToken as string;

      // El OWNER ya tiene token con activeTenantId de 'org-ld-403'. El miembro
      // necesita activar ese tenant. El token del miembro al hacer login tendrá
      // activeTenantId = org-ld-403 si es su único tenant.
      // Verificar que memberToken ya tiene el tenant o hacer switch si es necesario.
      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      // Sin permiso contabilidad.libro-diario.read → 403
      expect(res.status).toBe(403);
      void ownerToken; // usado en seedTenant, silenciar lint
    });
  });

  // ============================================================
  // REQ-LD-01: Validación de filtros
  // ============================================================

  describe('validación de filtros', () => {
    it('400 si no se recibe ningún filtro', async () => {
      const { token } = await seedTenant('org-ld-nofiltro');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('LIBRO_DIARIO_FILTRO_INVALIDO');
    });

    it('400 si se reciben ambos tipos de filtro (periodoFiscalId + fechaDesde+fechaHasta)', async () => {
      const { token, periodoEneroId } = await seedTenant('org-ld-ambos');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({
          periodoFiscalId: periodoEneroId,
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('LIBRO_DIARIO_FILTRO_INVALIDO');
    });

    it('400 si fechaDesde > fechaHasta', async () => {
      const { token } = await seedTenant('org-ld-ranginv');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-31', fechaHasta: '2026-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('LIBRO_DIARIO_RANGO_INVALIDO');
    });
  });

  // ============================================================
  // REQ-LD-01: filtro por período fiscal
  // ============================================================

  describe('filtro por periodoFiscalId', () => {
    it('200 con asientos del período solicitado', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } = await seedTenant('org-ld-periodo');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: periodoEneroId });

      expect(res.status).toBe(200);
      expect(res.body.asientos).toHaveLength(1);
      expect(res.body.rango.fechaDesde).toBe('2026-01-01');
      expect(res.body.rango.fechaHasta).toBe('2026-01-31');
    });

    it('404 si el periodoFiscalId no existe', async () => {
      const { token } = await seedTenant('org-ld-periodonx');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        // UUID válido v4 pero que no existe en la BD
        .query({ periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' });

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('LIBRO_DIARIO_PERIODO_NO_ENCONTRADO');
    });
  });

  // ============================================================
  // REQ-LD-01: filtro por rango de fechas
  // ============================================================

  describe('filtro por fechaDesde+fechaHasta', () => {
    it('200 con asientos del rango de fechas', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } = await seedTenant('org-ld-rango');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15');
      // Asiento fuera del rango — no debe aparecer
      const periodoFeb = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 2 },
      });
      await crearAsientoContabilizado(orgId, periodoFeb.id, cajaId, ventasId, '2026-02-01');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.asientos).toHaveLength(1);
      expect(res.body.asientos[0].fechaContable).toBe('2026-01-15');
    });
  });

  // ============================================================
  // REQ-LD-02: BORRADOR siempre excluido
  // ============================================================

  describe('exclusión de BORRADOR', () => {
    it('no incluye comprobantes en BORRADOR en el resultado', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } =
        await seedTenant('org-ld-borrador');

      // Borrador
      await prisma.comprobante.create({
        data: {
          organizationId: orgId,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.BORRADOR,
          fechaContable: new Date('2026-01-10T00:00:00Z'),
          periodoFiscalId: periodoEneroId,
          glosa: 'Borrador que no debe aparecer',
          createdByUserId: 'e2e-user',
        },
      });
      // Contabilizado
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.asientos).toHaveLength(1);
      expect(res.body.asientos[0].estado).toBe('CONTABILIZADO');
    });
  });

  // ============================================================
  // REQ-LD-08: aislamiento multi-tenant
  // ============================================================

  describe('aislamiento multi-tenant', () => {
    it('tenant A no ve los asientos de tenant B', async () => {
      const tenantA = await seedTenant('org-ld-ta');
      const tenantB = await seedTenant('org-ld-tb');

      // Asiento en tenant A
      await crearAsientoContabilizado(
        tenantA.orgId,
        tenantA.periodoEneroId,
        tenantA.cajaId,
        tenantA.ventasId,
        '2026-01-10',
      );
      // Asientos en tenant B (3 para hacer el contraste claro)
      for (let i = 1; i <= 3; i++) {
        await crearAsientoContabilizado(
          tenantB.orgId,
          tenantB.periodoEneroId,
          tenantB.cajaId,
          tenantB.ventasId,
          `2026-01-${String(i + 5).padStart(2, '0')}`,
        );
      }

      const resA = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      const resB = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(resA.status).toBe(200);
      expect(resA.body.asientos).toHaveLength(1);

      expect(resB.status).toBe(200);
      expect(resB.body.asientos).toHaveLength(3);
    });
  });

  // ============================================================
  // REQ-LD-03: toggle de anulados
  // ============================================================

  describe('toggle de anulados', () => {
    it('sin incluirAnulados: los anulados no aparecen; con incluirAnulados=true sí', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } =
        await seedTenant('org-ld-anulados');

      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-05');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-06', {
        anulado: true,
      });

      const resSin = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      const resCon = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31', incluirAnulados: 'true' });

      expect(resSin.status).toBe(200);
      expect(resSin.body.asientos).toHaveLength(1);
      expect(resSin.body.asientos[0].anulado).toBe(false);

      expect(resCon.status).toBe(200);
      expect(resCon.body.asientos).toHaveLength(2);
    });
  });

  // ============================================================
  // REQ-LD-06: totales debe=haber
  // ============================================================

  describe('totales partida doble', () => {
    it('totalDebeBob === totalHaberBob en asientos válidos', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } = await seedTenant('org-ld-totales');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.totalDebeBob).toBe('1000.00');
      expect(res.body.totalHaberBob).toBe('1000.00');
      // El asiento expone su propio subtotal (subtotal del comprobante)
      expect(res.body.asientos[0].totalDebeBob).toBe('1000.00');
      expect(res.body.asientos[0].totalHaberBob).toBe('1000.00');
    });

    it('0.00 para período sin asientos', async () => {
      const { token } = await seedTenant('org-ld-vacio');

      const res = await request(app.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.asientos).toHaveLength(0);
      expect(res.body.totalDebeBob).toBe('0.00');
      expect(res.body.totalHaberBob).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-LD-12..16: filtro por cuentaId
  // ============================================================

  describe('filtro por cuentaId (REQ-LD-12..16)', () => {
    /** Extiende seedTenant con: cuenta agrupadora + 3er cuenta de detalle + 3 asientos */
    async function seedTenantConFiltro(slug: string) {
      const base = await seedTenant(slug);

      // Cuenta agrupadora (esDetalle=false)
      const agrupadora = await prisma.cuenta.create({
        data: {
          organizationId: base.orgId,
          codigoInterno: '1.1',
          nombre: 'Caja y Bancos (agrupadora)',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 2,
          esDetalle: false,
        },
      });

      // 3ra cuenta de detalle (para asiento 3 — sin cajaId)
      const banco = await prisma.cuenta.create({
        data: {
          organizationId: base.orgId,
          codigoInterno: '1.1.2.001',
          nombre: 'Banco MN',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      });

      // Asiento 1: cajaId + ventasId
      const a1 = await crearAsientoContabilizado(
        base.orgId,
        base.periodoEneroId,
        base.cajaId,
        base.ventasId,
        '2026-01-05',
      );
      // Asiento 2: cajaId + bancoId
      const a2 = await prisma.comprobante.create({
        data: {
          organizationId: base.orgId,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.CONTABILIZADO,
          numero: `D2601-000002`,
          fechaContable: new Date('2026-01-06T00:00:00Z'),
          periodoFiscalId: base.periodoEneroId,
          glosa: 'Asiento 2 caja+banco',
          totalDebitoBob: 500,
          totalCreditoBob: 500,
          createdByUserId: 'e2e-filtro',
        },
      });
      await prisma.lineaComprobante.createMany({
        data: [
          {
            organizationId: base.orgId,
            comprobanteId: a2.id,
            orden: 1,
            cuentaId: base.cajaId,
            moneda: Moneda.BOB,
            debito: 500,
            credito: 0,
            debitoBob: 500,
            creditoBob: 0,
          },
          {
            organizationId: base.orgId,
            comprobanteId: a2.id,
            orden: 2,
            cuentaId: banco.id,
            moneda: Moneda.BOB,
            debito: 0,
            credito: 500,
            debitoBob: 0,
            creditoBob: 500,
          },
        ],
      });
      // Asiento 3: ventasId + bancoId (sin cajaId)
      const a3 = await prisma.comprobante.create({
        data: {
          organizationId: base.orgId,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.CONTABILIZADO,
          numero: `D2601-000003`,
          fechaContable: new Date('2026-01-07T00:00:00Z'),
          periodoFiscalId: base.periodoEneroId,
          glosa: 'Asiento 3 ventas+banco',
          totalDebitoBob: 300,
          totalCreditoBob: 300,
          createdByUserId: 'e2e-filtro',
        },
      });
      await prisma.lineaComprobante.createMany({
        data: [
          {
            organizationId: base.orgId,
            comprobanteId: a3.id,
            orden: 1,
            cuentaId: base.ventasId,
            moneda: Moneda.BOB,
            debito: 300,
            credito: 0,
            debitoBob: 300,
            creditoBob: 0,
          },
          {
            organizationId: base.orgId,
            comprobanteId: a3.id,
            orden: 2,
            cuentaId: banco.id,
            moneda: Moneda.BOB,
            debito: 0,
            credito: 300,
            debitoBob: 0,
            creditoBob: 300,
          },
        ],
      });

      return {
        ...base,
        agrupadoraId: agrupadora.id,
        bancoId: banco.id,
        a1Id: a1.id,
        a2Id: a2.id,
        a3Id: a3.id,
      };
    }

    describe('validación de cuenta (REQ-LD-13, REQ-LD-14)', () => {
      it('404 con LIBRO_DIARIO_CUENTA_NO_ENCONTRADA si el cuentaId no existe', async () => {
        const { token, periodoEneroId } = await seedTenant('org-ld-cx-404');

        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({
            periodoFiscalId: periodoEneroId,
            cuentaId: 'a1b2c3d4-e5f6-4a7b-8c9d-000000000000',
          });

        expect(res.status).toBe(404);
        expect(res.body.error?.code).toBe('LIBRO_DIARIO_CUENTA_NO_ENCONTRADA');
      });

      it('400 con LIBRO_DIARIO_CUENTA_NO_DETALLE si la cuenta es agrupadora (esDetalle=false)', async () => {
        const { token, periodoEneroId, agrupadoraId } = await seedTenantConFiltro('org-ld-cx-400');

        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({ periodoFiscalId: periodoEneroId, cuentaId: agrupadoraId });

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('LIBRO_DIARIO_CUENTA_NO_DETALLE');
      });

      it('404 con LIBRO_DIARIO_CUENTA_NO_ENCONTRADA si el cuentaId pertenece a otro tenant (no fuga cross-tenant)', async () => {
        const tenantA = await seedTenant('org-ld-cx-ta');
        const tenantB = await seedTenant('org-ld-cx-tb');

        // Token de A, cuentaId de B → 404 (mismo que inexistente)
        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${tenantA.token}`)
          .query({
            periodoFiscalId: tenantA.periodoEneroId,
            cuentaId: tenantB.cajaId, // cuenta de otro tenant
          });

        expect(res.status).toBe(404);
        expect(res.body.error?.code).toBe('LIBRO_DIARIO_CUENTA_NO_ENCONTRADA');
      });
    });

    describe('happy path (REQ-LD-12, REQ-LD-15)', () => {
      it('200 con 2 asientos al filtrar por cajaId (asientos 1 y 2)', async () => {
        const { token, periodoEneroId, cajaId, a1Id, a2Id } =
          await seedTenantConFiltro('org-ld-cx-hp2');

        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({ periodoFiscalId: periodoEneroId, cuentaId: cajaId });

        expect(res.status).toBe(200);
        expect(res.body.asientos).toHaveLength(2);
        const ids = res.body.asientos.map((a: { id: string }) => a.id);
        expect(ids).toContain(a1Id);
        expect(ids).toContain(a2Id);
      });

      it('cada asiento retornado tiene TODAS sus líneas (Opción A — REQ-LD-15)', async () => {
        const { token, periodoEneroId, cajaId } = await seedTenantConFiltro('org-ld-cx-opa');

        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({ periodoFiscalId: periodoEneroId, cuentaId: cajaId });

        expect(res.status).toBe(200);
        // Asiento 1 tiene 2 líneas (caja + ventas) — NO solo la de caja
        const asiento1 = res.body.asientos[0];
        expect(asiento1.lineas.length).toBeGreaterThanOrEqual(2);
      });

      it('cuenta sin movimientos en el rango → 200 con asientos vacíos', async () => {
        const { token, periodoEneroId, bancoId } = await seedTenant('org-ld-cx-vac').then(
          async (base) => {
            const banco = await prisma.cuenta.create({
              data: {
                organizationId: base.orgId,
                codigoInterno: '1.1.2.001',
                nombre: 'Banco MN sin movimientos',
                claseCuenta: ClaseCuenta.ACTIVO,
                naturaleza: NaturalezaCuenta.DEUDORA,
                nivel: 4,
                esDetalle: true,
              },
            });
            return { ...base, bancoId: banco.id };
          },
        );

        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({ periodoFiscalId: periodoEneroId, cuentaId: bancoId });

        expect(res.status).toBe(200);
        expect(res.body.asientos).toHaveLength(0);
        expect(res.body.totalDebeBob).toBe('0.00');
        expect(res.body.totalHaberBob).toBe('0.00');
      });
    });

    describe('regresión — sin cuentaId comportamiento idéntico (REQ-LD-12)', () => {
      it('sin cuentaId → retorna los 3 asientos del seed', async () => {
        const { token, periodoEneroId } = await seedTenantConFiltro('org-ld-cx-reg');

        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({ periodoFiscalId: periodoEneroId });

        expect(res.status).toBe(200);
        expect(res.body.asientos).toHaveLength(3);
      });
    });

    describe('incluirAnulados + cuentaId', () => {
      it('asiento anulado con cajaId excluido por default', async () => {
        const { token, periodoEneroId, cajaId, ventasId, orgId } =
          await seedTenant('org-ld-cx-anul');

        // Asiento normal
        await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-05');
        // Asiento anulado
        await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-06', {
          anulado: true,
          numero: 'D2601-000099',
        });

        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({ periodoFiscalId: periodoEneroId, cuentaId: cajaId });

        expect(res.status).toBe(200);
        expect(res.body.asientos).toHaveLength(1);
        expect(res.body.asientos[0].anulado).toBe(false);
      });

      it('con incluirAnulados=true → asiento anulado con cajaId incluido', async () => {
        const { token, periodoEneroId, cajaId, ventasId, orgId } =
          await seedTenant('org-ld-cx-ainc');

        await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-05');
        await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-06', {
          anulado: true,
          numero: 'D2601-000099',
        });

        const res = await request(app.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({
            periodoFiscalId: periodoEneroId,
            cuentaId: cajaId,
            incluirAnulados: 'true',
          });

        expect(res.status).toBe(200);
        expect(res.body.asientos).toHaveLength(2);
      });
    });
  });

  // ============================================================
  // REQ-LD-10: tope defensivo 422
  // ============================================================

  describe('tope defensivo', () => {
    // El límite real (5000) haría inviable insertar >5000 registros en CI.
    // Solución: levantamos una segunda instancia de la app con el límite fijado
    // en 1 via process.env antes de compilar el módulo, de modo que ConfigService
    // lea el override. 2 comprobantes CONTABILIZADOS ya superan el límite de 1.
    let appTope: INestApplication;
    let prismaTope: PrismaService;

    beforeAll(async () => {
      // Override ANTES de compilar — ConfigModule lee process.env en forRoot.
      process.env['LIBRO_DIARIO_MAX_ASIENTOS'] = '1';

      const fixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      appTope = fixture.createNestApplication();
      appTope.setGlobalPrefix('api');
      appTope.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
      );
      await appTope.init();
      prismaTope = fixture.get(PrismaService);
    });

    afterAll(async () => {
      delete process.env['LIBRO_DIARIO_MAX_ASIENTOS'];
      await appTope.close();
    });

    it('422 con LIBRO_DIARIO_RANGO_EXCEDIDO cuando la cantidad supera el límite configurado', async () => {
      // Limitamos a 1 para no insertar 5001 comprobantes.
      // Con 2 asientos CONTABILIZADOS en el rango, el count (2) supera el límite (1) → 422.
      const hashedPassword = await bcrypt.hash('password123', 10);
      const owner = await prismaTope.user.create({
        data: { email: 'owner+tope@ld.bo', hashedPassword, isEmailVerified: true },
      });
      const org = await prismaTope.organization.create({
        data: {
          slug: 'org-ld-tope',
          name: 'Org Tope',
          memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
        },
      });

      const loginRes = await request(appTope.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'owner+tope@ld.bo', password: 'password123' });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.accessToken as string;

      // Crear gestión y períodos
      const gestRes = await request(appTope.getHttpServer())
        .post('/api/gestiones')
        .set('Authorization', `Bearer ${token}`)
        .send({ year: 2026 });
      expect(gestRes.status).toBe(201);

      // Cuentas de detalle
      const [caja, ventas] = await Promise.all([
        prismaTope.cuenta.create({
          data: {
            organizationId: org.id,
            codigoInterno: '1.1.1.001',
            nombre: 'Caja MN',
            claseCuenta: ClaseCuenta.ACTIVO,
            naturaleza: NaturalezaCuenta.DEUDORA,
            nivel: 4,
            esDetalle: true,
          },
        }),
        prismaTope.cuenta.create({
          data: {
            organizationId: org.id,
            codigoInterno: '4.1.1.001',
            nombre: 'Ventas',
            claseCuenta: ClaseCuenta.INGRESO,
            naturaleza: NaturalezaCuenta.ACREEDORA,
            nivel: 4,
            esDetalle: true,
          },
        }),
      ]);

      const periodo = await prismaTope.periodoFiscal.findFirstOrThrow({
        where: { organizationId: org.id, year: 2026, month: 1 },
      });

      // 2 asientos CONTABILIZADOS — con límite=1, count(2) > 1 → 422.
      // Usamos prismaTope directamente (crearAsientoContabilizado del scope padre usa `prisma`).
      for (let i = 1; i <= 2; i++) {
        const comp = await prismaTope.comprobante.create({
          data: {
            organizationId: org.id,
            tipo: TipoComprobante.DIARIO,
            estado: EstadoComprobante.CONTABILIZADO,
            numero: `D2601-00000${i}`,
            fechaContable: new Date(`2026-01-0${i}T00:00:00Z`),
            periodoFiscalId: periodo.id,
            glosa: 'Asiento para test de tope',
            totalDebitoBob: 1000,
            totalCreditoBob: 1000,
            createdByUserId: 'e2e-tope',
          },
        });
        await prismaTope.lineaComprobante.createMany({
          data: [
            {
              organizationId: org.id,
              comprobanteId: comp.id,
              orden: 1,
              cuentaId: caja.id,
              moneda: Moneda.BOB,
              debito: 1000,
              credito: 0,
              debitoBob: 1000,
              creditoBob: 0,
            },
            {
              organizationId: org.id,
              comprobanteId: comp.id,
              orden: 2,
              cuentaId: ventas.id,
              moneda: Moneda.BOB,
              debito: 0,
              credito: 1000,
              debitoBob: 0,
              creditoBob: 1000,
            },
          ],
        });
      }

      const res = await request(appTope.getHttpServer())
        .get('/api/libros/diario')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('LIBRO_DIARIO_RANGO_EXCEDIDO');
    });

    describe('el filtro por cuentaId se aplica al tope (REQ-LD-16)', () => {
      // El tope cuenta lo mismo que lista (buildWhere único). Con el filtro de
      // cuenta, el count se reduce a los asientos que tocan esa cuenta: una cuenta
      // que aparece en más asientos que el tope da 422; una bajo el tope da 200,
      // aunque el rango completo lo supere.
      // El cleanup (beforeEach) borra la BD antes de cada test, así que la siembra
      // va DENTRO de cada `it` (no en beforeAll). Slug distinto por test.
      async function seedTopePorCuenta(slug: string): Promise<{
        token: string;
        cajaId: string;
        bancoId: string;
      }> {
        const hashedPassword = await bcrypt.hash('password123', 10);
        const owner = await prismaTope.user.create({
          data: { email: `owner+${slug}@ld.bo`, hashedPassword, isEmailVerified: true },
        });
        const org = await prismaTope.organization.create({
          data: {
            slug,
            name: `Org ${slug}`,
            memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
          },
        });

        const loginRes = await request(appTope.getHttpServer())
          .post('/api/auth/login')
          .send({ email: `owner+${slug}@ld.bo`, password: 'password123' });
        const token = loginRes.body.accessToken as string;

        await request(appTope.getHttpServer())
          .post('/api/gestiones')
          .set('Authorization', `Bearer ${token}`)
          .send({ year: 2026 });

        const [caja, ventas, banco] = await Promise.all([
          prismaTope.cuenta.create({
            data: {
              organizationId: org.id,
              codigoInterno: '1.1.1.010',
              nombre: 'Caja MN',
              claseCuenta: ClaseCuenta.ACTIVO,
              naturaleza: NaturalezaCuenta.DEUDORA,
              nivel: 4,
              esDetalle: true,
            },
          }),
          prismaTope.cuenta.create({
            data: {
              organizationId: org.id,
              codigoInterno: '4.1.1.010',
              nombre: 'Ventas',
              claseCuenta: ClaseCuenta.INGRESO,
              naturaleza: NaturalezaCuenta.ACREEDORA,
              nivel: 4,
              esDetalle: true,
            },
          }),
          prismaTope.cuenta.create({
            data: {
              organizationId: org.id,
              codigoInterno: '1.1.2.010',
              nombre: 'Banco MN',
              claseCuenta: ClaseCuenta.ACTIVO,
              naturaleza: NaturalezaCuenta.DEUDORA,
              nivel: 4,
              esDetalle: true,
            },
          }),
        ]);
        const periodo = await prismaTope.periodoFiscal.findFirstOrThrow({
          where: { organizationId: org.id, year: 2026, month: 1 },
        });

        // Asiento 1: caja + ventas. Asiento 2: caja + banco.
        // → caja toca 2 asientos (supera tope=1); ventas y banco tocan 1 (bajo tope).
        const contraCuentas = [ventas.id, banco.id];
        for (let i = 1; i <= 2; i++) {
          const comp = await prismaTope.comprobante.create({
            data: {
              organizationId: org.id,
              tipo: TipoComprobante.DIARIO,
              estado: EstadoComprobante.CONTABILIZADO,
              numero: `D2601-00001${i}`,
              fechaContable: new Date(`2026-01-0${i}T00:00:00Z`),
              periodoFiscalId: periodo.id,
              glosa: 'Asiento tope por cuenta',
              totalDebitoBob: 1000,
              totalCreditoBob: 1000,
              createdByUserId: 'e2e-tope-cta',
            },
          });
          await prismaTope.lineaComprobante.createMany({
            data: [
              {
                organizationId: org.id,
                comprobanteId: comp.id,
                orden: 1,
                cuentaId: caja.id,
                moneda: Moneda.BOB,
                debito: 1000,
                credito: 0,
                debitoBob: 1000,
                creditoBob: 0,
              },
              {
                organizationId: org.id,
                comprobanteId: comp.id,
                orden: 2,
                cuentaId: contraCuentas[i - 1]!,
                moneda: Moneda.BOB,
                debito: 0,
                credito: 1000,
                debitoBob: 0,
                creditoBob: 1000,
              },
            ],
          });
        }

        return { token, cajaId: caja.id, bancoId: banco.id };
      }

      it('422 cuando la cuenta filtrada aparece en más asientos que el tope', async () => {
        // cuentaId=caja → 2 asientos > límite 1 → 422.
        const { token, cajaId } = await seedTopePorCuenta('org-ld-tope-caja');
        const res = await request(appTope.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31', cuentaId: cajaId });

        expect(res.status).toBe(422);
        expect(res.body.error?.code).toBe('LIBRO_DIARIO_RANGO_EXCEDIDO');
      });

      it('200 cuando la cuenta filtrada queda bajo el tope aunque el rango total lo supere', async () => {
        // cuentaId=banco → 1 asiento = límite 1, no lo supera → 200, pese a que el
        // rango completo (2 asientos) sí superaría el tope sin el filtro.
        const { token, bancoId } = await seedTopePorCuenta('org-ld-tope-banco');
        const res = await request(appTope.getHttpServer())
          .get('/api/libros/diario')
          .set('Authorization', `Bearer ${token}`)
          .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31', cuentaId: bancoId });

        expect(res.status).toBe(200);
        expect(res.body.asientos).toHaveLength(1);
      });
    });
  });
});
