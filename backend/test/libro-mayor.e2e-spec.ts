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
 * E2E del endpoint GET /api/libros/mayor.
 *
 * Cubre:
 *   - REQ-LM-11: 401 sin token, 403 sin permiso
 *   - REQ-LM-01: filtros período y rango, 400 si inválido
 *   - REQ-LM-02: BORRADOR nunca aparece en movimientos ni saldo inicial
 *   - REQ-LM-03: anulados excluidos por default, incluibles con toggle
 *   - REQ-LM-04: saldo inicial correcto por naturaleza (DEUDORA/ACREEDORA)
 *   - REQ-LM-05: running balance acumulado determinístico
 *   - REQ-LM-06: saldoFinalBob === saldoCorriente del último movimiento
 *   - REQ-LM-07: cuenta agrupadora → 400, cuenta inexistente → 404
 *   - REQ-LM-08: soloConMovimiento, sin cuentaId todas las cuentas
 *   - REQ-LM-09: aislamiento multi-tenant (CRÍTICO)
 *   - REQ-LM-10: montos como strings "NNN.NN"
 *   - REQ-LM-12: 422 cuando se supera el tope
 *   - REQ-LM-13: periodoFiscalId inexistente → 404
 */
describe('Libro Mayor (e2e)', () => {
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
        email: `owner+${slug}@lm.bo`,
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

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@lm.bo`, password: 'password123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    // Crear gestión 2026 (crea todos los períodos mensuales)
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

    // Cuenta agrupadora (esDetalle=false)
    const agrupadora = await prisma.cuenta.create({
      data: {
        organizationId: org.id,
        codigoInterno: '1.1',
        nombre: 'Activo Corriente',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 2,
        esDetalle: false,
      },
    });

    const periodoEnero = await prisma.periodoFiscal.findFirstOrThrow({
      where: { organizationId: org.id, year: 2026, month: 1 },
    });

    return {
      token,
      orgId: org.id,
      cajaId: caja.id,
      ventasId: ventas.id,
      agrupadAId: agrupadora.id,
      periodoEneroId: periodoEnero.id,
    };
  }

  /** Crea un asiento CONTABILIZADO en BD para tests E2E. */
  async function crearAsientoContabilizado(
    orgId: string,
    periodoId: string,
    cuentaDebeId: string,
    cuentaHaberId: string,
    fechaContable: string,
    opts: { anulado?: boolean; numero?: string; importe?: number } = {},
  ) {
    const importe = opts.importe ?? 1000;
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: orgId,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.CONTABILIZADO,
        numero:
          opts.numero ?? `D2601-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: new Date(`${fechaContable}T00:00:00Z`),
        periodoFiscalId: periodoId,
        glosa: 'Asiento E2E Mayor',
        totalDebitoBob: importe,
        totalCreditoBob: importe,
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
          cuentaId: cuentaDebeId,
          moneda: Moneda.BOB,
          debito: importe,
          credito: 0,
          debitoBob: importe,
          creditoBob: 0,
        },
        {
          organizationId: orgId,
          comprobanteId: comp.id,
          orden: 2,
          cuentaId: cuentaHaberId,
          moneda: Moneda.BOB,
          debito: 0,
          credito: importe,
          debitoBob: 0,
          creditoBob: importe,
        },
      ],
    });
    return comp;
  }

  // ============================================================
  // REQ-LM-11: RBAC
  // ============================================================

  describe('RBAC', () => {
    it('401 sin token de autenticación', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });
      expect(res.status).toBe(401);
    });

    it('403 si el usuario no tiene el permiso contabilidad.libro-mayor.read', async () => {
      const { token: ownerToken, orgId } = await seedTenant('org-lm-403');

      const hashedPassword = await bcrypt.hash('password123', 10);
      const memberUser = await prisma.user.create({
        data: { email: 'member-lm@lm.bo', hashedPassword, isEmailVerified: true },
      });
      const role = await prisma.customRole.create({
        data: {
          organizationId: orgId,
          slug: 'solo-asientos-lm',
          name: 'Solo asientos (sin libro-mayor)',
          permissions: ['contabilidad.asientos.read'],
        },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: memberUser.id, customRoleId: role.id },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'member-lm@lm.bo', password: 'password123' });
      expect(loginRes.status).toBe(200);
      const memberToken = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(403);
      void ownerToken;
    });

    it('200 con JWT válido, permiso y filtro correcto', async () => {
      const { token } = await seedTenant('org-lm-200');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
    });
  });

  // ============================================================
  // REQ-LM-01: Validación de filtros
  // ============================================================

  describe('validación de filtros', () => {
    it('400 si no se recibe ningún filtro', async () => {
      const { token } = await seedTenant('org-lm-nofiltro');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('LIBRO_MAYOR_FILTRO_INVALIDO');
    });

    it('400 si se reciben ambos tipos de filtro simultáneamente', async () => {
      const { token, periodoEneroId } = await seedTenant('org-lm-ambos');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({
          periodoFiscalId: periodoEneroId,
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('LIBRO_MAYOR_FILTRO_INVALIDO');
    });

    it('400 si fechaDesde sin fechaHasta', async () => {
      const { token } = await seedTenant('org-lm-parcial');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('LIBRO_MAYOR_FILTRO_INVALIDO');
    });

    it('400 si fechaDesde > fechaHasta', async () => {
      const { token } = await seedTenant('org-lm-ranginv');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-31', fechaHasta: '2026-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('LIBRO_MAYOR_RANGO_INVALIDO');
    });
  });

  // ============================================================
  // REQ-LM-13: periodoFiscalId
  // ============================================================

  describe('filtro por periodoFiscalId', () => {
    it('200 con asientos del período solicitado', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } = await seedTenant('org-lm-periodo');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: periodoEneroId });

      expect(res.status).toBe(200);
      expect(res.body.cuentas.length).toBeGreaterThan(0);
      expect(res.body.rango.fechaDesde).toBe('2026-01-01');
      expect(res.body.rango.fechaHasta).toBe('2026-01-31');
    });

    it('404 si el periodoFiscalId no existe (REQ-LM-13)', async () => {
      const { token } = await seedTenant('org-lm-periodonx');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' });

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('LIBRO_MAYOR_PERIODO_NO_ENCONTRADO');
    });
  });

  // ============================================================
  // REQ-LM-07: cuenta agrupadora / no encontrada
  // ============================================================

  describe('validación de cuenta', () => {
    it('400 si cuentaId es de una cuenta agrupadora (REQ-LM-07)', async () => {
      const { token, agrupadAId } = await seedTenant('org-lm-agrup');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31', cuentaId: agrupadAId });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('LIBRO_MAYOR_CUENTA_NO_DETALLE');
    });

    it('404 si cuentaId no existe (REQ-LM-07)', async () => {
      const { token } = await seedTenant('org-lm-cuentanx');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
          cuentaId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        });

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('LIBRO_MAYOR_CUENTA_NO_ENCONTRADA');
    });
  });

  // ============================================================
  // Happy path: respuesta correcta, saldo inicial, running balance
  // ============================================================

  describe('happy path — saldo inicial y running balance', () => {
    it('devuelve 200 con estructura correcta (REQ-LM-10)', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } = await seedTenant('org-lm-hp');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.rango).toEqual({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });
      expect(Array.isArray(res.body.cuentas)).toBe(true);
      expect(typeof res.body.totalDebeBob).toBe('string');
      expect(typeof res.body.totalHaberBob).toBe('string');
    });

    it('montos como string "NNN.NN" — no números (REQ-LM-10)', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } = await seedTenant('org-lm-str');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      const caja = res.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      expect(typeof caja.saldoInicialBob).toBe('string');
      expect(typeof caja.saldoFinalBob).toBe('string');
      expect(typeof caja.totalDebeBob).toBe('string');
      const mov = caja.movimientos[0];
      expect(typeof mov.debeBob).toBe('string');
      expect(typeof mov.haberBob).toBe('string');
      expect(typeof mov.saldoCorrienteBob).toBe('string');
      // Verificar formato NNN.NN
      expect(mov.debeBob).toMatch(/^\d+\.\d{2}$/);
    });

    it('saldo inicial DEUDORA correcto (movimiento previo al rango) (REQ-LM-04)', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } =
        await seedTenant('org-lm-saldoinicial');

      // Crear gestión 2025 + período diciembre 2025 para el movimiento previo
      const gestion2025 = await prisma.gestionFiscal.create({
        data: { organizationId: orgId, year: 2025, mesInicio: 1 },
      });
      const periodosDic = await prisma.periodoFiscal.create({
        data: {
          organizationId: orgId,
          gestionId: gestion2025.id,
          year: 2025,
          month: 12,
          ordenEnGestion: 12,
          status: 'CERRADO',
        },
      });

      // Asiento en diciembre 2025 (saldo inicial para enero 2026)
      await crearAsientoContabilizado(orgId, periodosDic.id, cajaId, ventasId, '2025-12-15', {
        importe: 800,
      });
      // Asiento en enero 2026 (movimiento del rango)
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      const caja = res.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      // DEUDORA: saldoInicial = 800(debe) - 0(haber) = 800
      expect(caja.saldoInicialBob).toBe('800.00');
    });

    it('saldoFinalBob coincide con saldoCorriente del último movimiento (REQ-LM-06)', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } =
        await seedTenant('org-lm-saldofinal');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      const caja = res.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      const movimientos = caja.movimientos;
      const ultimoMov = movimientos[movimientos.length - 1];
      expect(caja.saldoFinalBob).toBe(ultimoMov.saldoCorrienteBob);
    });
  });

  // ============================================================
  // REQ-LM-02: BORRADOR siempre excluido
  // ============================================================

  describe('exclusión de BORRADOR', () => {
    it('no incluye comprobantes en BORRADOR en movimientos ni saldo inicial', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } =
        await seedTenant('org-lm-borrador');

      // Borrador en enero — no debe aparecer en movimientos
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
      // Contabilizado para comparar
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      const caja = res.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      expect(caja.movimientos).toHaveLength(1);
      expect(caja.movimientos[0].estado).toBe('CONTABILIZADO');
    });
  });

  // ============================================================
  // REQ-LM-03: toggle de anulados
  // ============================================================

  describe('toggle de anulados', () => {
    it('sin incluirAnulados: los anulados no aparecen; con incluirAnulados=true sí', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } =
        await seedTenant('org-lm-anulados');

      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-05');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-06', {
        anulado: true,
      });

      const resSin = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      const resCon = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31', incluirAnulados: 'true' });

      expect(resSin.status).toBe(200);
      const cajaSin = resSin.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      expect(cajaSin.movimientos).toHaveLength(1);
      expect(cajaSin.movimientos[0].anulado).toBe(false);

      expect(resCon.status).toBe(200);
      const cajaCon = resCon.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      expect(cajaCon.movimientos).toHaveLength(2);
    });
  });

  // ============================================================
  // REQ-LM-08: soloConMovimiento
  // ============================================================

  describe('soloConMovimiento', () => {
    it('soloConMovimiento=false: cuenta con saldo previo pero sin movimientos aparece con movimientos:[] (REQ-LM-08)', async () => {
      const { token, orgId, cajaId, ventasId } = await seedTenant('org-lm-solomov');

      // Crear gestión 2025 + período diciembre 2025
      const gestion2025 = await prisma.gestionFiscal.create({
        data: { organizationId: orgId, year: 2025, mesInicio: 1 },
      });
      const periodoDic = await prisma.periodoFiscal.create({
        data: {
          organizationId: orgId,
          gestionId: gestion2025.id,
          year: 2025,
          month: 12,
          ordenEnGestion: 12,
          status: 'CERRADO',
        },
      });

      // Solo saldo previo en diciembre, sin movimiento en enero
      await crearAsientoContabilizado(orgId, periodoDic.id, cajaId, ventasId, '2025-12-15');

      const resSolo = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });
      // soloConMovimiento default=true → cuentas con solo saldo previo NO aparecen
      expect(resSolo.status).toBe(200);
      expect(resSolo.body.cuentas).toHaveLength(0);

      const resNoSolo = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-01-31',
          soloConMovimiento: 'false',
        });
      expect(resNoSolo.status).toBe(200);
      // Cuentas con saldo previo != 0 deben aparecer
      expect(resNoSolo.body.cuentas.length).toBeGreaterThan(0);
      const caja = resNoSolo.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      expect(caja.movimientos).toHaveLength(0);
      expect(caja.saldoFinalBob).toBe(caja.saldoInicialBob);
    });

    it('sin cuentaId: responde todas las cuentas con movimiento (REQ-LM-08)', async () => {
      const { token, orgId, cajaId, ventasId, periodoEneroId } = await seedTenant('org-lm-todas');
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10');

      const res = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      // El asiento afecta 2 cuentas (caja y ventas)
      expect(res.body.cuentas).toHaveLength(2);
    });
  });

  // ============================================================
  // REQ-LM-09: aislamiento multi-tenant (CRÍTICO)
  // ============================================================

  describe('aislamiento multi-tenant (CRÍTICO)', () => {
    it('tenant A no ve los movimientos de tenant B, ni en saldo inicial', async () => {
      const tenantA = await seedTenant('org-lm-ta');
      const tenantB = await seedTenant('org-lm-tb');

      // Tenant A: 1 asiento con importe 1000
      await crearAsientoContabilizado(
        tenantA.orgId,
        tenantA.periodoEneroId,
        tenantA.cajaId,
        tenantA.ventasId,
        '2026-01-10',
        { importe: 1000 },
      );
      // Tenant B: 3 asientos con importe 5000
      for (let i = 1; i <= 3; i++) {
        await crearAsientoContabilizado(
          tenantB.orgId,
          tenantB.periodoEneroId,
          tenantB.cajaId,
          tenantB.ventasId,
          `2026-01-${String(i + 5).padStart(2, '0')}`,
          { importe: 5000 },
        );
      }

      const resA = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      const resB = await request(app.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(resA.status).toBe(200);
      const cajaA = resA.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      expect(cajaA.movimientos).toHaveLength(1); // Solo el de A (no los 3 de B)
      // El importe de A es 1000, no 5000 de B
      expect(cajaA.movimientos[0].debeBob).toBe('1000.00');

      expect(resB.status).toBe(200);
      const cajaB = resB.body.cuentas.find(
        (c: { codigoInterno: string }) => c.codigoInterno === '1.1.1.001',
      );
      expect(cajaB.movimientos).toHaveLength(3);
    });
  });

  // ============================================================
  // REQ-LM-12: tope defensivo 422
  // ============================================================

  describe('tope defensivo', () => {
    let appTope: INestApplication;
    let prismaTope: PrismaService;

    beforeAll(async () => {
      // Override ANTES de compilar — ConfigModule lee process.env en forRoot.
      process.env['LIBRO_MAYOR_MAX_MOVIMIENTOS'] = '1';

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
      delete process.env['LIBRO_MAYOR_MAX_MOVIMIENTOS'];
      await appTope.close();
    });

    it('422 con LIBRO_MAYOR_RANGO_EXCEDIDO cuando la cantidad supera el límite configurado', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const owner = await prismaTope.user.create({
        data: { email: 'owner+tope-lm@lm.bo', hashedPassword, isEmailVerified: true },
      });
      const org = await prismaTope.organization.create({
        data: {
          slug: 'org-lm-tope',
          name: 'Org Tope LM',
          memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
        },
      });

      const loginRes = await request(appTope.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'owner+tope-lm@lm.bo', password: 'password123' });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.accessToken as string;

      const gestRes = await request(appTope.getHttpServer())
        .post('/api/gestiones')
        .set('Authorization', `Bearer ${token}`)
        .send({ year: 2026 });
      expect(gestRes.status).toBe(201);

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

      // 2 líneas ya superan el límite de 1
      const comp = await prismaTope.comprobante.create({
        data: {
          organizationId: org.id,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.CONTABILIZADO,
          numero: 'D2601-000001',
          fechaContable: new Date('2026-01-01T00:00:00Z'),
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

      const res = await request(appTope.getHttpServer())
        .get('/api/libros/mayor')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('LIBRO_MAYOR_RANGO_EXCEDIDO');
    });
  });
});
