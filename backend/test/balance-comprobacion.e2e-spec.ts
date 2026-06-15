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
 * E2E del endpoint GET /api/eeff/balance-comprobacion.
 *
 * Cubre:
 *   - REQ-BC-01: rango directo / periodoFiscalId / ambos modos / sin modo
 *   - REQ-BC-02: formato inválido / desde>hasta / periodoFiscalId ajeno
 *   - REQ-BC-03/06: 4 columnas y cuadre
 *   - REQ-BC-04: cuenta de detalle sin movimiento ausente
 *   - REQ-BC-07: cuenta de naturaleza opuesta listada
 *   - REQ-BC-08: anulado excluido por default / incluido con toggle
 *   - REQ-BC-09: aislamiento entre tenants (CRÍTICO)
 *   - REQ-BC-10: RBAC contabilidad.eeff.read
 *   - REQ-BC-11: montos string, fechas YYYY-MM-DD, cuadra boolean
 *   - REQ-BC-12: rango sin movimiento → reporte vacío cuadrado
 */
describe('Balance de Comprobación (e2e)', () => {
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

  const URL = '/api/eeff/balance-comprobacion';

  // ============================================================
  // Fixture helpers
  // ============================================================

  async function seedTenant(slug: string) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@bc.bo`, hashedPassword, isEmailVerified: true },
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
      .send({ email: `owner+${slug}@bc.bo`, password: 'password123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

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

    const periodoAbril = await prisma.periodoFiscal.findFirstOrThrow({
      where: { organizationId: orgId, year: 2026, month: 4 },
    });

    return { cajaId: caja.id, ventasId: ventas.id, periodoAbrilId: periodoAbril.id };
  }

  async function crearAsiento(
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
        numero: `D2604-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: new Date(`${fechaContable}T00:00:00Z`),
        periodoFiscalId: periodoId,
        glosa: 'Asiento E2E Balance Comprobación',
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
  // REQ-BC-10: RBAC
  // ============================================================

  describe('RBAC (REQ-BC-10)', () => {
    it('401 sin token', async () => {
      const res = await request(app.getHttpServer())
        .get(URL)
        .query({ desde: '2026-04-01', hasta: '2026-04-30' });
      expect(res.status).toBe(401);
    });

    it('403 sin permiso contabilidad.eeff.read', async () => {
      const { orgId } = await seedTenant('org-bc-403');

      const hashedPassword = await bcrypt.hash('password123', 10);
      const memberUser = await prisma.user.create({
        data: { email: 'member-bc@bc.bo', hashedPassword, isEmailVerified: true },
      });
      const role = await prisma.customRole.create({
        data: {
          organizationId: orgId,
          slug: 'sin-eeff-bc',
          name: 'Sin EEFF',
          permissions: ['contabilidad.asientos.read'],
        },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: memberUser.id, customRoleId: role.id },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'member-bc@bc.bo', password: 'password123' });
      const memberToken = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30' });

      expect(res.status).toBe(403);
    });
  });

  // ============================================================
  // REQ-BC-01: Modos de rango
  // ============================================================

  describe('modos de rango (REQ-BC-01)', () => {
    it('rango directo válido → 200 con fechas en la respuesta', async () => {
      const { token } = await seedTenant('org-bc-rango');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30' });

      expect(res.status).toBe(200);
      expect(res.body.fechaDesde).toBe('2026-04-01');
      expect(res.body.fechaHasta).toBe('2026-04-30');
    });

    it('por periodoFiscalId → 200 con rango del mes', async () => {
      const { token, orgId } = await seedTenant('org-bc-periodo');
      const periodo = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 4 },
      });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: periodo.id });

      expect(res.status).toBe(200);
      expect(res.body.fechaDesde).toBe('2026-04-01');
      expect(res.body.fechaHasta).toBe('2026-04-30');
    });

    it('ambos modos a la vez → 422 RANGO_AMBIGUO', async () => {
      const { token, orgId } = await seedTenant('org-bc-ambiguo');
      const periodo = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 4 },
      });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30', periodoFiscalId: periodo.id });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_BALANCE_COMPROBACION_RANGO_AMBIGUO');
    });

    it('sin ningún modo → 422 RANGO_REQUERIDO', async () => {
      const { token } = await seedTenant('org-bc-requerido');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO');
    });
  });

  // ============================================================
  // REQ-BC-02: Validación de fechas
  // ============================================================

  describe('validación de fechas (REQ-BC-02)', () => {
    it('formato inválido (DD-MM-YYYY) → 400 (ValidationPipe)', async () => {
      const { token } = await seedTenant('org-bc-formato');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '01-04-2026', hasta: '30-04-2026' });

      expect(res.status).toBe(400);
    });

    it('fecha imposible (2026-02-30) → 422 RANGO_INVALIDO', async () => {
      const { token } = await seedTenant('org-bc-imposible');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-02-30', hasta: '2026-04-30' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO');
    });

    it('desde > hasta → 422 RANGO_INVALIDO', async () => {
      const { token } = await seedTenant('org-bc-desorden');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-30', hasta: '2026-04-01' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO');
    });

    it('periodoFiscalId ajeno → 422 PERIODO_NO_ENCONTRADO', async () => {
      const { token } = await seedTenant('org-bc-ajeno-a');
      const { orgId: orgBId } = await seedTenant('org-bc-ajeno-b');
      const periodoB = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgBId, year: 2026, month: 4 },
      });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: periodoB.id });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_BALANCE_COMPROBACION_PERIODO_NO_ENCONTRADO');
    });
  });

  // ============================================================
  // REQ-BC-03/06/11: 4 columnas, cuadre, forma del DTO
  // ============================================================

  describe('4 columnas, cuadre y forma del DTO (REQ-BC-03/06/11)', () => {
    it('reporte cuadrado con líneas de detalle y montos string', async () => {
      const { token, orgId } = await seedTenant('org-bc-cuadra');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-15', { importe: 1000 });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30' });

      expect(res.status).toBe(200);
      expect(res.body.cuadra).toBe(true);
      expect(typeof res.body.cuadra).toBe('boolean');
      expect(res.body.totalSumasDebito).toBe('1000.00');
      expect(res.body.totalSumasCredito).toBe('1000.00');
      expect(res.body.diferenciaSumas).toBe('0.00');

      expect(res.body.lineas).toHaveLength(2);
      // Orden por codigoInterno ASC: Caja (1.1.1.001) antes que Ventas (4.1.1.001)
      const caja = res.body.lineas[0];
      expect(caja.codigoInterno).toBe('1.1.1.001');
      expect(caja.sumasDebito).toBe('1000.00');
      expect(caja.sumasCredito).toBe('0.00');
      expect(caja.saldoDeudor).toBe('1000.00');
      expect(caja.saldoAcreedor).toBe('0.00');
      expect(typeof caja.sumasDebito).toBe('string');

      const ventas = res.body.lineas[1];
      expect(ventas.codigoInterno).toBe('4.1.1.001');
      expect(ventas.saldoAcreedor).toBe('1000.00');
      expect(ventas.saldoDeudor).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-BC-04: cuenta de detalle sin movimiento ausente
  // ============================================================

  describe('cuenta de detalle sin movimiento ausente (REQ-BC-04)', () => {
    it('una cuenta de detalle sin líneas no aparece en lineas', async () => {
      const { token, orgId } = await seedTenant('org-bc-sin-mov');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);
      // Cuenta extra SIN movimiento
      await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '1.1.2.001',
          nombre: 'Banco',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      });
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-15', { importe: 1000 });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30' });

      expect(res.status).toBe(200);
      const codigos = res.body.lineas.map((l: { codigoInterno: string }) => l.codigoInterno);
      expect(codigos).not.toContain('1.1.2.001');
      expect(res.body.lineas).toHaveLength(2);
    });
  });

  // ============================================================
  // REQ-BC-07: cuenta de naturaleza opuesta
  // ============================================================

  describe('cuenta de naturaleza opuesta (REQ-BC-07)', () => {
    it('una cuenta DEUDORA con saldo acreedor aparece en cuentasNaturalezaOpuesta', async () => {
      const { token, orgId } = await seedTenant('org-bc-opuesta');
      const periodoAbril = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 4 },
      });

      // Cuenta DEUDORA (Caja) y otra cuenta para la contrapartida
      const caja = await prisma.cuenta.create({
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
      });
      const otra = await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '1.1.2.001',
          nombre: 'Banco',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      });

      // Caja queda con saldo ACREEDOR (crédito 500 > débito 0) pese a ser DEUDORA:
      // débito Banco 500 / crédito Caja 500
      await crearAsiento(orgId, periodoAbril.id, otra.id, caja.id, '2026-04-10', { importe: 500 });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30' });

      expect(res.status).toBe(200);
      const opuestas = res.body.cuentasNaturalezaOpuesta;
      expect(opuestas).toHaveLength(1);
      expect(opuestas[0].codigoInterno).toBe('1.1.1.001');
      expect(opuestas[0].naturaleza).toBe('DEUDORA');
      expect(opuestas[0].saldoOpuesto).toBe('500.00');
    });
  });

  // ============================================================
  // REQ-BC-08: anulados
  // ============================================================

  describe('anulados (REQ-BC-08)', () => {
    it('anulado excluido por default, incluido con incluirAnulados=true', async () => {
      const { token, orgId } = await seedTenant('org-bc-anulado');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-10', { importe: 1000 });
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-10', {
        importe: 500,
        anulado: true,
      });

      const sin = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30', incluirAnulados: 'false' });

      const con = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30', incluirAnulados: 'true' });

      expect(sin.status).toBe(200);
      expect(con.status).toBe(200);
      expect(parseFloat(sin.body.totalSumasDebito)).toBe(1000);
      expect(parseFloat(con.body.totalSumasDebito)).toBe(1500);
    });
  });

  // ============================================================
  // REQ-BC-09: Multi-tenant aislamiento (CRÍTICO)
  // ============================================================

  describe('multi-tenant aislamiento (REQ-BC-09, CRÍTICO)', () => {
    it('Tenant A ve solo sus datos, no los del Tenant B', async () => {
      const { token: tokenA, orgId: orgAId } = await seedTenant('org-bc-mt-a');
      const { orgId: orgBId } = await seedTenant('org-bc-mt-b');

      const a = await seedCuentaBase(orgAId);
      await crearAsiento(orgAId, a.periodoAbrilId, a.cajaId, a.ventasId, '2026-04-15', {
        importe: 8000,
      });

      const b = await seedCuentaBase(orgBId);
      await crearAsiento(orgBId, b.periodoAbrilId, b.cajaId, b.ventasId, '2026-04-15', {
        importe: 9999,
      });

      const resA = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30' });

      expect(resA.status).toBe(200);
      expect(parseFloat(resA.body.totalSumasDebito)).toBe(8000);
    });
  });

  // ============================================================
  // REQ-BC-12: rango sin movimiento → reporte vacío cuadrado
  // ============================================================

  describe('rango sin movimiento (REQ-BC-12)', () => {
    it('reporte vacío cuadrado: lineas=[], totales 0.00, cuadra=true', async () => {
      const { token } = await seedTenant('org-bc-vacio');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ desde: '2026-04-01', hasta: '2026-04-30' });

      expect(res.status).toBe(200);
      expect(res.body.lineas).toEqual([]);
      expect(res.body.totalSumasDebito).toBe('0.00');
      expect(res.body.totalSumasCredito).toBe('0.00');
      expect(res.body.totalSaldoDeudor).toBe('0.00');
      expect(res.body.totalSaldoAcreedor).toBe('0.00');
      expect(res.body.cuadra).toBe(true);
      expect(res.body.cuentasNaturalezaOpuesta).toEqual([]);
    });
  });
});
