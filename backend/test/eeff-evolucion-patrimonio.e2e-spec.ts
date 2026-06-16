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
 * E2E del endpoint GET /api/eeff/evolucion-patrimonio (Estado de Evolución del
 * Patrimonio Neto, nivel A+).
 *
 * Cubre:
 *   - RBAC: 401 sin token, 403 sin contabilidad.eeff.read, 200 con permiso
 *   - 400 sin ninguna forma de rango (REPORTES_EVOLUCION_PATRIMONIO_RANGO_INVALIDO)
 *   - 422 gestionId inexistente (REPORTES_EVOLUCION_PATRIMONIO_SIN_GESTION)
 *   - Caso funcional: componentes del patrimonio + columna sintética del
 *     Resultado del Ejercicio + cuadre + montos string + fechas YYYY-MM-DD
 *   - Multi-tenant aislamiento (CRÍTICO §4.2)
 */
describe('Evolución del Patrimonio (e2e)', () => {
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
      data: { email: `owner+${slug}@eepn.bo`, hashedPassword, isEmailVerified: true },
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
      .send({ email: `owner+${slug}@eepn.bo`, password: 'password123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    const gestRes = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026 });
    expect(gestRes.status).toBe(201);

    const gestion = await prisma.gestionFiscal.findFirstOrThrow({
      where: { organizationId: org.id, year: 2026 },
    });

    return { token, orgId: org.id, gestionId: gestion.id };
  }

  async function seedCuentas(orgId: string) {
    const [caja, capital, ventas] = await Promise.all([
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
          codigoInterno: '3.1.1.001',
          nombre: 'Capital Social',
          claseCuenta: ClaseCuenta.PATRIMONIO,
          subClaseCuenta: SubClaseCuenta.PATRIMONIO_CAPITAL,
          naturaleza: NaturalezaCuenta.ACREEDORA,
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

    return {
      cajaId: caja.id,
      capitalId: capital.id,
      ventasId: ventas.id,
      periodoEneroId: periodoEnero.id,
    };
  }

  async function crearAsiento(
    orgId: string,
    periodoId: string,
    cuentaDebeId: string,
    cuentaHaberId: string,
    importe: number,
  ) {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: orgId,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.CONTABILIZADO,
        numero: `D2601-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: new Date('2026-01-15T00:00:00Z'),
        periodoFiscalId: periodoId,
        glosa: 'Asiento E2E EEPN',
        totalDebitoBob: importe,
        totalCreditoBob: importe,
        createdByUserId: 'e2e-user',
        anulado: false,
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
  // RBAC
  // ============================================================

  describe('RBAC', () => {
    it('401 sin token', async () => {
      const res = await request(app.getHttpServer()).get('/api/eeff/evolucion-patrimonio');
      expect(res.status).toBe(401);
    });

    it('403 sin permiso contabilidad.eeff.read', async () => {
      const { orgId, gestionId } = await seedTenant('org-eepn-403');

      const hashedPassword = await bcrypt.hash('password123', 10);
      const memberUser = await prisma.user.create({
        data: { email: 'member-eepn@eepn.bo', hashedPassword, isEmailVerified: true },
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
        .send({ email: 'member-eepn@eepn.bo', password: 'password123' });
      const memberToken = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get('/api/eeff/evolucion-patrimonio')
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ gestionId });

      expect(res.status).toBe(403);
    });

    it('200 con permiso y gestionId válido', async () => {
      const { token, gestionId } = await seedTenant('org-eepn-200');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/evolucion-patrimonio')
        .set('Authorization', `Bearer ${token}`)
        .query({ gestionId });

      expect(res.status).toBe(200);
    });
  });

  // ============================================================
  // Validación de rango
  // ============================================================

  describe('validación de rango', () => {
    it('400 sin ninguna forma de rango → REPORTES_EVOLUCION_PATRIMONIO_RANGO_INVALIDO', async () => {
      const { token } = await seedTenant('org-eepn-400');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/evolucion-patrimonio')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('REPORTES_EVOLUCION_PATRIMONIO_RANGO_INVALIDO');
    });

    it('422 gestionId inexistente → REPORTES_EVOLUCION_PATRIMONIO_SIN_GESTION', async () => {
      const { token } = await seedTenant('org-eepn-422');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/evolucion-patrimonio')
        .set('Authorization', `Bearer ${token}`)
        .query({ gestionId: '99999999-9999-4999-8999-999999999999' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_EVOLUCION_PATRIMONIO_SIN_GESTION');
    });
  });

  // ============================================================
  // Caso funcional
  // ============================================================

  describe('reporte funcional', () => {
    it('refleja aporte de capital + resultado del ejercicio y cuadra', async () => {
      const { token, orgId, gestionId } = await seedTenant('org-eepn-ok');
      const { cajaId, capitalId, ventasId, periodoEneroId } = await seedCuentas(orgId);

      // Aporte de capital: Caja 100000 / Capital 100000
      await crearAsiento(orgId, periodoEneroId, cajaId, capitalId, 100000);
      // Venta (genera resultado): Caja 30000 / Ventas 30000
      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, 30000);

      const res = await request(app.getHttpServer())
        .get('/api/eeff/evolucion-patrimonio')
        .set('Authorization', `Bearer ${token}`)
        .query({ gestionId });

      expect(res.status).toBe(200);
      expect(res.body.fechaDesde).toBe('2026-01-01');
      expect(res.body.fechaHasta).toBe('2026-12-31');

      const capital = res.body.componentes.find(
        (c: { codigoInterno: string | null }) => c.codigoInterno === '3.1.1.001',
      );
      expect(capital).toBeDefined();
      expect(capital.saldoInicialBob).toBe('0.00');
      expect(capital.otrosMovimientosBob).toBe('100000.00');
      expect(capital.resultadoEjercicioBob).toBe('0.00');
      expect(capital.saldoFinalBob).toBe('100000.00');
      expect(capital.cuadra).toBe(true);

      const sintetica = res.body.componentes.find((c: { esSintetica: boolean }) => c.esSintetica);
      expect(sintetica).toBeDefined();
      expect(sintetica.cuentaId).toBeNull();
      expect(sintetica.resultadoEjercicioBob).toBe('30000.00');
      expect(sintetica.saldoFinalBob).toBe('30000.00');

      // Totales: Capital 100000 + Resultado 30000 = 130000
      expect(res.body.totales.saldoInicialBob).toBe('0.00');
      expect(res.body.totales.otrosMovimientosBob).toBe('100000.00');
      expect(res.body.totales.resultadoEjercicioBob).toBe('30000.00');
      expect(res.body.totales.saldoFinalBob).toBe('130000.00');
      expect(res.body.cuadra).toBe(true);
      expect(res.body.diferenciaBob).toBe('0.00');
    });

    it('control cruzado: el saldoFinal total del EEPN == Total Patrimonio del Balance General', async () => {
      const { token, orgId, gestionId } = await seedTenant('org-eepn-cruz');
      const { cajaId, capitalId, ventasId, periodoEneroId } = await seedCuentas(orgId);

      await crearAsiento(orgId, periodoEneroId, cajaId, capitalId, 100000);
      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, 30000);

      const eepn = await request(app.getHttpServer())
        .get('/api/eeff/evolucion-patrimonio')
        .set('Authorization', `Bearer ${token}`)
        .query({ gestionId });

      const balance = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-12-31' });

      expect(eepn.status).toBe(200);
      expect(balance.status).toBe(200);
      expect(eepn.body.totales.saldoFinalBob).toBe(balance.body.totalPatrimonioBob);
    });
  });

  // ============================================================
  // Multi-tenant aislamiento (§4.2)
  // ============================================================

  describe('aislamiento multi-tenant', () => {
    it('el patrimonio de otra org NO aparece', async () => {
      const a = await seedTenant('org-eepn-a');
      const ca = await seedCuentas(a.orgId);
      await crearAsiento(a.orgId, ca.periodoEneroId, ca.cajaId, ca.capitalId, 77000);

      const b = await seedTenant('org-eepn-b');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/evolucion-patrimonio')
        .set('Authorization', `Bearer ${b.token}`)
        .query({ gestionId: b.gestionId });

      expect(res.status).toBe(200);
      // La org B no tiene movimientos → patrimonio vacío, sin la cuenta de A.
      expect(res.body.componentes).toHaveLength(0);
      expect(res.body.totales.saldoFinalBob).toBe('0.00');
    });
  });
});
