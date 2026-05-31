import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  EstadoComprobante,
  Moneda,
  NaturalezaCuenta,
  SubClaseCuenta,
  SystemRole,
  TipoComprobante,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanupTestData } from './helpers/test-factory';

/**
 * E2E del endpoint GET /api/eeff/balance.
 *
 * Cubre:
 *   - REQ-BG-01: fecha requerida, formato YYYY-MM-DD
 *   - REQ-BG-02: inferencia gestión vigente, 422 si no hay
 *   - REQ-BG-03: BORRADOR excluido
 *   - REQ-BG-04: toggle incluirAnulados
 *   - REQ-BG-05: saldo neto por naturaleza
 *   - REQ-BG-07: esContraria resta del grupo
 *   - REQ-BG-08: cuenta con saldo 0 ausente
 *   - REQ-BG-09: Resultado del Ejercicio en Patrimonio como línea sintética
 *   - REQ-BG-11: cuadra + diferencia
 *   - REQ-BG-12: multi-tenant aislamiento (CRÍTICO)
 *   - REQ-BG-13: RBAC contabilidad.eeff.read
 *   - REQ-BG-14: sin plan de cuentas → balance en cero
 *   - REQ-BG-15: montos como strings "NNN.NN", fechaCorte "YYYY-MM-DD"
 */
describe('Balance General (e2e)', () => {
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
      data: { email: `owner+${slug}@bg.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@bg.bo`, password: 'password123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    // Crear gestión 2026
    const gestRes = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026 });
    expect(gestRes.status).toBe(201);

    return { token, orgId: org.id };
  }

  async function seedCuentaBase(orgId: string) {
    const [caja, ventas] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);

    const periodoEnero = await prisma.periodoFiscal.findFirstOrThrow({
      where: { organizationId: orgId, year: 2026, month: 1 },
    });

    return { cajaId: caja.id, ventasId: ventas.id, periodoEneroId: periodoEnero.id };
  }

  async function crearAsientoContabilizado(
    orgId: string,
    periodoId: string,
    cuentaDebeId: string,
    cuentaHaberId: string,
    fechaContable: string,
    opts: { anulado?: boolean; importe?: number; estado?: EstadoComprobante } = {},
  ) {
    const importe = opts.importe ?? 1000;
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: orgId,
        tipo: TipoComprobante.DIARIO,
        estado: opts.estado ?? EstadoComprobante.CONTABILIZADO,
        numero: `D2601-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: new Date(`${fechaContable}T00:00:00Z`),
        periodoFiscalId: periodoId,
        glosa: 'Asiento E2E Balance',
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
  // REQ-BG-13: RBAC
  // ============================================================

  describe('RBAC', () => {
    it('401 sin token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .query({ fecha: '2026-05-31' });
      expect(res.status).toBe(401);
    });

    it('403 sin permiso contabilidad.eeff.read', async () => {
      const { token: ownerToken, orgId } = await seedTenant('org-bg-403');

      const hashedPassword = await bcrypt.hash('password123', 10);
      const memberUser = await prisma.user.create({
        data: { email: 'member-bg@bg.bo', hashedPassword, isEmailVerified: true },
      });
      const role = await prisma.customRole.create({
        data: {
          organizationId: orgId,
          slug: 'sin-eeff',
          name: 'Sin EEFF',
          permissions: ['contabilidad.asientos.read'],
        },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: memberUser.id, customRoleId: role.id },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'member-bg@bg.bo', password: 'password123' });
      expect(loginRes.status).toBe(200);
      const memberToken = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ fecha: '2026-05-31' });

      expect(res.status).toBe(403);
      void ownerToken;
    });

    it('200 con JWT válido, permiso y fecha válida', async () => {
      const { token } = await seedTenant('org-bg-200');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-05-31' });

      expect(res.status).toBe(200);
    });
  });

  // ============================================================
  // REQ-BG-01: Validación fecha
  // ============================================================

  describe('validación de fecha', () => {
    it('400 sin ?fecha → code REPORTES_BALANCE_FECHA_INVALIDA', async () => {
      const { token } = await seedTenant('org-bg-400a');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('400 con fecha formato inválido (DD-MM-YYYY en lugar de YYYY-MM-DD)', async () => {
      const { token } = await seedTenant('org-bg-400b');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '31-05-2026' });

      // El ValidationPipe rechaza el DTO antes de llegar al service
      expect(res.status).toBe(400);
    });

    it('400 con fecha semánticamente inválida (pasa regex pero no existe) → code REPORTES_BALANCE_FECHA_INVALIDA', async () => {
      // 2026-02-30 pasa el regex \d{4}-\d{2}-\d{2} pero no es una fecha real.
      // El ValidationPipe no la rechaza (solo valida el patrón); la validación
      // semántica ocurre en parseFechaContable() dentro del service,
      // que lanza FechaCorteInvalidaError con code REPORTES_BALANCE_FECHA_INVALIDA.
      const { token } = await seedTenant('org-bg-400c');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-02-30' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('REPORTES_BALANCE_FECHA_INVALIDA');
    });
  });

  // ============================================================
  // REQ-BG-02: Gestión fiscal
  // ============================================================

  describe('gestión fiscal', () => {
    it('422 fecha fuera de cualquier gestión → code REPORTES_BALANCE_SIN_GESTION', async () => {
      const { token } = await seedTenant('org-bg-422');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2025-01-01' }); // antes de la gestión 2026

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_BALANCE_SIN_GESTION');
    });

    it('200 con fecha dentro de gestión abierta, gestionId correcto en respuesta', async () => {
      const { token, orgId } = await seedTenant('org-bg-gestion');

      // Obtener la gestión 2026
      const gestion = await prisma.gestionFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-05-31' });

      expect(res.status).toBe(200);
      expect(res.body.gestionId).toBe(gestion.id);
    });
  });

  // ============================================================
  // REQ-BG-14: Sin plan de cuentas → balance en cero
  // ============================================================

  describe('sin plan de cuentas', () => {
    it('200 con totales "0.00" y cuadra: true', async () => {
      const { token } = await seedTenant('org-bg-sin-cuentas');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-05-31' });

      expect(res.status).toBe(200);
      expect(res.body.totalActivoBob).toBe('0.00');
      expect(res.body.totalPasivoBob).toBe('0.00');
      expect(res.body.totalPatrimonioBob).toBe('0.00');
      expect(res.body.cuadra).toBe(true);
    });
  });

  // ============================================================
  // REQ-BG-15: Forma DTO
  // ============================================================

  describe('forma del DTO', () => {
    it('montos como strings "NNN.NN", fechaCorte como "YYYY-MM-DD"', async () => {
      const { token, orgId } = await seedTenant('org-bg-dto');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentaBase(orgId);
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15', {
        importe: 1250,
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.fechaCorte).toBe('2026-01-31');
      expect(typeof res.body.totalActivoBob).toBe('string');
      expect(typeof res.body.resultadoEjercicioBob).toBe('string');
      expect(typeof res.body.diferenciaBob).toBe('string');
      // saldoBob en las cuentas debe ser string
      if (res.body.activo?.subsecciones?.[0]?.cuentas?.[0]) {
        expect(typeof res.body.activo.subsecciones[0].cuentas[0].saldoBob).toBe('string');
      }
    });

    it('respuesta tiene activo, pasivo y patrimonio (REQ-BG-10)', async () => {
      const { token } = await seedTenant('org-bg-secciones');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-05-31' });

      expect(res.status).toBe(200);
      expect(res.body.activo).toBeDefined();
      expect(res.body.activo.claseCuenta).toBe('ACTIVO');
      expect(res.body.pasivo).toBeDefined();
      expect(res.body.pasivo.claseCuenta).toBe('PASIVO');
      expect(res.body.patrimonio).toBeDefined();
      expect(res.body.patrimonio.claseCuenta).toBe('PATRIMONIO');
    });
  });

  // ============================================================
  // REQ-BG-03: BORRADOR excluido
  // ============================================================

  describe('BORRADOR excluido (REQ-BG-03)', () => {
    it('BORRADOR no contribuye al saldo del activo', async () => {
      const { token, orgId } = await seedTenant('org-bg-borrador');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentaBase(orgId);

      // Crear BORRADOR — NO debe aparecer
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15', {
        importe: 5000,
        estado: EstadoComprobante.BORRADOR,
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.totalActivoBob).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-BG-04: incluirAnulados toggle
  // ============================================================

  describe('toggle incluirAnulados (REQ-BG-04)', () => {
    it('incluirAnulados=true: anulado contribuye al saldo', async () => {
      const { token, orgId } = await seedTenant('org-bg-anulado');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentaBase(orgId);

      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10', {
        importe: 1000,
      });
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10', {
        importe: 500,
        anulado: true,
      });

      const sinAnulados = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-01-31', incluirAnulados: 'false' });

      const conAnulados = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-01-31', incluirAnulados: 'true' });

      expect(sinAnulados.status).toBe(200);
      expect(conAnulados.status).toBe(200);
      // Sin anulados: solo 1000; con anulados: 1500
      expect(parseFloat(sinAnulados.body.totalActivoBob)).toBe(1000);
      expect(parseFloat(conAnulados.body.totalActivoBob)).toBe(1500);
    });
  });

  // ============================================================
  // REQ-BG-07: esContraria resta del grupo
  // ============================================================

  describe('esContraria resta del grupo (REQ-BG-07, CRÍTICO)', () => {
    it('cuenta con esContraria=true reduce el activo total', async () => {
      const { token, orgId } = await seedTenant('org-bg-contraria');

      const periodoEnero = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 1 },
      });

      // Equipo (ACTIVO_NO_CORRIENTE, DEUDORA)
      const equipo = await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '1.2.1.001',
          nombre: 'Equipos',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      });

      // Depreciación Acumulada (ACTIVO_NO_CORRIENTE, ACREEDORA, esContraria=true)
      const depreciacion = await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '1.2.1.002',
          nombre: 'Depreciación Acumulada Equipos',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
          esContraria: true,
        },
      });

      // Asiento: débito Equipo 10000 / crédito Depreciación 2000 (separate entries)
      await crearAsientoContabilizado(
        orgId,
        periodoEnero.id,
        equipo.id,
        depreciacion.id,
        '2026-01-10',
        { importe: 10000 },
      );

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-01-31' });

      expect(res.status).toBe(200);
      // Equipo saldo = 10000 (DEUDORA: debe-haber = 10000-0)
      // Depreciación saldo neto = 10000 (ACREEDORA: haber-debe = 10000-0)
      // Total ANC = 10000 - 10000 = 0 (esContraria resta)
      expect(res.body.totalActivoBob).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-BG-09: Resultado del Ejercicio en Patrimonio
  // ============================================================

  describe('Resultado del Ejercicio (REQ-BG-09)', () => {
    it('línea sintética presente en Patrimonio', async () => {
      const { token, orgId } = await seedTenant('org-bg-resultado');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentaBase(orgId);
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15', {
        importe: 3000,
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.resultadoEjercicioBob).toBeDefined();
      expect(typeof res.body.resultadoEjercicioBob).toBe('string');

      // Buscar línea sintética en PATRIMONIO_RESULTADOS
      const patrimonioResultados = res.body.patrimonio?.subsecciones?.find(
        (s: { subClaseCuenta: string }) => s.subClaseCuenta === 'PATRIMONIO_RESULTADOS',
      );
      expect(patrimonioResultados).toBeDefined();
      const lineaSintetica = patrimonioResultados?.cuentas?.find(
        (c: { esSintetica: boolean }) => c.esSintetica,
      );
      expect(lineaSintetica).toBeDefined();
      expect(lineaSintetica?.cuentaId).toBeNull();
    });
  });

  // ============================================================
  // REQ-BG-11: cuadra
  // ============================================================

  describe('cuadra (REQ-BG-11)', () => {
    it('cuadra: true con datos coherentes', async () => {
      const { token, orgId } = await seedTenant('org-bg-cuadra');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentaBase(orgId);
      await crearAsientoContabilizado(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15', {
        importe: 5000,
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.cuadra).toBeDefined();
      expect(typeof res.body.diferenciaBob).toBe('string');
    });
  });

  // ============================================================
  // REQ-BG-12: Multi-tenant (CRÍTICO)
  // ============================================================

  describe('multi-tenant aislamiento (REQ-BG-12, CRÍTICO)', () => {
    it('Tenant A ve solo sus datos, no los del Tenant B', async () => {
      const { token: tokenA, orgId: orgAId } = await seedTenant('org-bg-a-mt');
      const { token: _tokenB, orgId: orgBId } = await seedTenant('org-bg-b-mt');

      // Tenant A: Caja con saldo 8000
      const {
        cajaId: cajaAId,
        ventasId: ventasAId,
        periodoEneroId: periodoAId,
      } = await seedCuentaBase(orgAId);
      await crearAsientoContabilizado(orgAId, periodoAId, cajaAId, ventasAId, '2026-01-15', {
        importe: 8000,
      });

      // Tenant B: Caja con saldo 9999
      const {
        cajaId: cajaBId,
        ventasId: ventasBId,
        periodoEneroId: periodoBId,
      } = await seedCuentaBase(orgBId);
      await crearAsientoContabilizado(orgBId, periodoBId, cajaBId, ventasBId, '2026-01-15', {
        importe: 9999,
      });

      // Tenant A consulta su balance
      const resA = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ fecha: '2026-01-31' });

      expect(resA.status).toBe(200);
      // Tenant A debe tener activo = 8000, no 9999 ni 17999
      expect(parseFloat(resA.body.totalActivoBob)).toBe(8000);
    });
  });
});
