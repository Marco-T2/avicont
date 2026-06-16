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
 * E2E del endpoint GET /api/eeff/hoja-trabajo.
 *
 * Cubre:
 *   - REQ-HT-01: rango directo / periodoFiscalId / ambos modos / sin modo
 *   - REQ-HT-02: desde>hasta / periodoFiscalId ajeno / fecha imposible
 *   - REQ-HT-03/07: 12 columnas y 6 cuadres
 *   - REQ-HT-08: fila sintética Utilidad/Pérdida del Ejercicio
 *   - REQ-HT-09: CIERRE excluido de la hoja
 *   - REQ-HT-10: comprobantes AJUSTE en columnas 5-6, no en 1-2
 *   - REQ-HT-11: cross-check BC — saldoAjustado == BC.saldo cuando no hay ajustes
 *   - REQ-HT-12: anulado excluido por default / incluido con toggle
 *   - REQ-HT-13: aislamiento entre tenants (CRÍTICO)
 *   - REQ-HT-14: RBAC contabilidad.eeff.read
 *   - REQ-HT-15: montos string, fechas YYYY-MM-DD, cuadra boolean
 *   - REQ-HT-16: rango sin movimiento → reporte vacío con 6 cuadres true
 */
describe('Hoja de Trabajo de 12 Columnas (e2e)', () => {
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

  const URL = '/api/eeff/hoja-trabajo';

  // ============================================================
  // Fixture helpers
  // ============================================================

  async function seedTenant(slug: string) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@ht.bo`, hashedPassword, isEmailVerified: true },
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
      .send({ email: `owner+${slug}@ht.bo`, password: 'password123' });
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
    opts: {
      anulado?: boolean;
      importe?: number;
      estado?: EstadoComprobante;
      tipo?: TipoComprobante;
    } = {},
  ) {
    const importe = opts.importe ?? 1000;
    const tipo = opts.tipo ?? TipoComprobante.DIARIO;
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: orgId,
        tipo,
        estado: opts.estado ?? EstadoComprobante.CONTABILIZADO,
        numero: `D2604-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: new Date(`${fechaContable}T00:00:00Z`),
        periodoFiscalId: periodoId,
        glosa: 'Asiento E2E Hoja de Trabajo',
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
  // REQ-HT-14: RBAC
  // ============================================================

  describe('RBAC (REQ-HT-14)', () => {
    it('401 sin token', async () => {
      const res = await request(app.getHttpServer())
        .get(URL)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });
      expect(res.status).toBe(401);
    });

    it('403 sin permiso contabilidad.eeff.read', async () => {
      const { orgId } = await seedTenant('org-ht-403');

      const hashedPassword = await bcrypt.hash('password123', 10);
      const memberUser = await prisma.user.create({
        data: { email: 'member-ht@ht.bo', hashedPassword, isEmailVerified: true },
      });
      const role = await prisma.customRole.create({
        data: {
          organizationId: orgId,
          slug: 'sin-eeff-ht',
          name: 'Sin EEFF',
          permissions: ['contabilidad.asientos.read'],
        },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: memberUser.id, customRoleId: role.id },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'member-ht@ht.bo', password: 'password123' });
      const memberToken = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });

      expect(res.status).toBe(403);
    });
  });

  // ============================================================
  // REQ-HT-01: Modos de rango
  // ============================================================

  describe('modos de rango (REQ-HT-01)', () => {
    it('rango directo válido → 200 con fechas en la respuesta', async () => {
      const { token } = await seedTenant('org-ht-rango');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });

      expect(res.status).toBe(200);
      expect(res.body.fechaDesde).toBe('2026-04-01');
      expect(res.body.fechaHasta).toBe('2026-04-30');
    });

    it('por periodoFiscalId → 200 con rango del mes', async () => {
      const { token, orgId } = await seedTenant('org-ht-periodo');
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
      const { token, orgId } = await seedTenant('org-ht-ambiguo');
      const periodo = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 4 },
      });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30', periodoFiscalId: periodo.id });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_HOJA_TRABAJO_RANGO_AMBIGUO');
    });

    it('sin ningún modo → 422 RANGO_REQUERIDO', async () => {
      const { token } = await seedTenant('org-ht-requerido');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_HOJA_TRABAJO_RANGO_REQUERIDO');
    });
  });

  // ============================================================
  // REQ-HT-02: Validación de fechas
  // ============================================================

  describe('validación de fechas (REQ-HT-02)', () => {
    it('formato inválido (DD-MM-YYYY) → 400 (ValidationPipe)', async () => {
      const { token } = await seedTenant('org-ht-formato');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '01-04-2026', fechaHasta: '30-04-2026' });

      expect(res.status).toBe(400);
    });

    it('desde > hasta → 422 RANGO_INVALIDO', async () => {
      const { token } = await seedTenant('org-ht-desorden');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-30', fechaHasta: '2026-04-01' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_HOJA_TRABAJO_RANGO_INVALIDO');
    });

    it('periodoFiscalId ajeno → 422 PERIODO_NO_ENCONTRADO', async () => {
      const { token } = await seedTenant('org-ht-ajeno-a');
      const { orgId: orgBId } = await seedTenant('org-ht-ajeno-b');
      const periodoB = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgBId, year: 2026, month: 4 },
      });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: periodoB.id });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_HOJA_TRABAJO_PERIODO_NO_ENCONTRADO');
    });
  });

  // ============================================================
  // REQ-HT-03/07/15: 12 columnas, 6 cuadres, forma del DTO
  // ============================================================

  describe('12 columnas, cuadres y forma del DTO (REQ-HT-03/07/15)', () => {
    it('reporte cuadrado con 12 columnas en string y cuadres.cuadra=true', async () => {
      const { token, orgId } = await seedTenant('org-ht-cuadra');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-15', { importe: 1000 });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });

      expect(res.status).toBe(200);

      // Cuadres: los 6 cuadres individuales y el general
      const cuadres = res.body.cuadres;
      expect(cuadres.cuadra).toBe(true);
      expect(typeof cuadres.cuadra).toBe('boolean');
      expect(cuadres.cuadraSumas).toBe(true);
      expect(cuadres.cuadraSaldos).toBe(true);
      expect(cuadres.cuadraAjustes).toBe(true);
      expect(cuadres.cuadraSaldosAjustados).toBe(true);
      expect(cuadres.cuadraEstadoResultados).toBe(true);
      expect(cuadres.cuadraBalanceGeneral).toBe(true);
      expect(cuadres.diferenciaSumas).toBe('0.00');
      expect(typeof cuadres.diferenciaSumas).toBe('string');

      // Totales
      const totales = res.body.totales;
      expect(totales.sumasDebe).toBe('1000.00');
      expect(totales.sumasHaber).toBe('1000.00');
      expect(typeof totales.sumasDebe).toBe('string');

      // Caja (1.1.1.001): col1=1000, col3=1000, col7=1000, col11=1000
      const caja = res.body.lineas.find(
        (l: { codigoInterno: string | null }) => l.codigoInterno === '1.1.1.001',
      );
      expect(caja).toBeDefined();
      expect(caja.sumasDebe).toBe('1000.00');
      expect(caja.sumasHaber).toBe('0.00');
      expect(caja.saldoDeudor).toBe('1000.00');
      expect(caja.saldoAcreedor).toBe('0.00');
      expect(caja.ajustesDebe).toBe('0.00');
      expect(caja.ajustesHaber).toBe('0.00');
      expect(caja.saldoAjustadoDeudor).toBe('1000.00');
      expect(caja.saldoAjustadoAcreedor).toBe('0.00');
      expect(caja.bgActivo).toBe('1000.00');
      expect(caja.bgPasPat).toBe('0.00');
      expect(caja.erPerdidas).toBe('0.00');
      expect(caja.erGanancias).toBe('0.00');
      expect(caja.esSintetica).toBe(false);
    });
  });

  // ============================================================
  // REQ-HT-08: fila sintética Utilidad/Pérdida del Ejercicio
  // ============================================================

  describe('fila sintética (REQ-HT-08)', () => {
    it('con utilidad: aparece fila sintética con cuentaId=null en bgPasPat y erPerdidas', async () => {
      const { token, orgId } = await seedTenant('org-ht-sintetica');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);
      // Caja 1000 DB / Ventas 1000 CR → utilidad 1000 (Ingresos > Egresos)
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-15', { importe: 1000 });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });

      expect(res.status).toBe(200);

      const sintetica = res.body.lineas.find(
        (l: { esSintetica: boolean }) => l.esSintetica === true,
      );
      expect(sintetica).toBeDefined();
      expect(sintetica.cuentaId).toBeNull();
      expect(sintetica.codigoInterno).toBeNull();
      // Utilidad → va a erPerdidas (cuadra el ER) y bgPasPat (cuadra el BG)
      expect(sintetica.erPerdidas).toBe('1000.00');
      expect(sintetica.bgPasPat).toBe('1000.00');
      expect(sintetica.erGanancias).toBe('0.00');
      expect(sintetica.bgActivo).toBe('0.00');
      // Nombre describe la condición
      expect(sintetica.nombre).toContain('Utilidad');
    });
  });

  // ============================================================
  // REQ-HT-09: comprobantes CIERRE excluidos
  // ============================================================

  describe('CIERRE excluido (REQ-HT-09)', () => {
    it('asiento tipo CIERRE no afecta ninguna columna de la hoja', async () => {
      const { token, orgId } = await seedTenant('org-ht-cierre');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);

      // Asiento ordinario DIARIO
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-10', { importe: 1000 });
      // Asiento tipo CIERRE — NO debe aparecer en la hoja
      await crearAsiento(orgId, periodoAbrilId, ventasId, cajaId, '2026-04-30', {
        importe: 1000,
        tipo: TipoComprobante.CIERRE,
      });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });

      expect(res.status).toBe(200);

      // Si CIERRE estuviera incluido, las sumas Caja serían debe=1000+credito=1000
      // y Ventas debito=1000+credito=1000 → saldos = 0.
      // Con CIERRE excluido, Caja debe=1000, Ventas credito=1000.
      const caja = res.body.lineas.find(
        (l: { codigoInterno: string | null }) => l.codigoInterno === '1.1.1.001',
      );
      expect(caja).toBeDefined();
      expect(caja.sumasDebe).toBe('1000.00');
      expect(caja.sumasHaber).toBe('0.00');
      expect(caja.saldoDeudor).toBe('1000.00');
    });
  });

  // ============================================================
  // REQ-HT-10: comprobantes AJUSTE van a columnas 5-6, no 1-2
  // ============================================================

  describe('AJUSTE en columnas 5-6 (REQ-HT-10)', () => {
    it('asiento AJUSTE llena ajustesDebe/ajustesHaber, no sumasDebe/sumasHaber', async () => {
      const { token, orgId } = await seedTenant('org-ht-ajuste');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);

      // Ordinario DIARIO 1000
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-10', { importe: 1000 });
      // Ajuste 200
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-15', {
        importe: 200,
        tipo: TipoComprobante.AJUSTE,
      });

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });

      expect(res.status).toBe(200);

      const caja = res.body.lineas.find(
        (l: { codigoInterno: string | null }) => l.codigoInterno === '1.1.1.001',
      );
      expect(caja).toBeDefined();
      // Columnas 1-2: solo el DIARIO
      expect(caja.sumasDebe).toBe('1000.00');
      expect(caja.sumasHaber).toBe('0.00');
      // Columnas 5-6: solo el AJUSTE
      expect(caja.ajustesDebe).toBe('200.00');
      expect(caja.ajustesHaber).toBe('0.00');
      // Columnas 7-8: saldo ajustado = 1000 + 200 = 1200
      expect(caja.saldoAjustadoDeudor).toBe('1200.00');
      expect(caja.saldoAjustadoAcreedor).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-HT-11: cross-check BC — saldoAjustado == BC.saldo cuando no hay ajustes
  // ============================================================

  describe('cross-check con Balance de Comprobación (REQ-HT-11)', () => {
    it('sin ajustes: saldoAjustadoDeudor de HT == saldoDeudor de BC para las mismas cuentas', async () => {
      const { token, orgId } = await seedTenant('org-ht-crosscheck');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-10', { importe: 750 });

      const [resHT, resBC] = await Promise.all([
        request(app.getHttpServer())
          .get(URL)
          .set('Authorization', `Bearer ${token}`)
          .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' }),
        request(app.getHttpServer())
          .get('/api/eeff/balance-comprobacion')
          .set('Authorization', `Bearer ${token}`)
          .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' }),
      ]);

      expect(resHT.status).toBe(200);
      expect(resBC.status).toBe(200);

      const cajaHT = resHT.body.lineas.find(
        (l: { codigoInterno: string | null }) => l.codigoInterno === '1.1.1.001',
      );
      const cajaBC = resBC.body.lineas.find(
        (l: { codigoInterno: string }) => l.codigoInterno === '1.1.1.001',
      );

      expect(cajaHT).toBeDefined();
      expect(cajaBC).toBeDefined();
      // REQ-HT-11: saldoAjustadoDeudor (HT) == saldoDeudor (BC) cuando no hay ajustes
      expect(cajaHT.saldoAjustadoDeudor).toBe(cajaBC.saldoDeudor);
      expect(cajaHT.saldoAjustadoAcreedor).toBe(cajaBC.saldoAcreedor);
    });
  });

  // ============================================================
  // REQ-HT-12: anulados
  // ============================================================

  describe('anulados (REQ-HT-12)', () => {
    it('anulado excluido por default, incluido con incluirAnulados=true', async () => {
      const { token, orgId } = await seedTenant('org-ht-anulado');
      const { cajaId, ventasId, periodoAbrilId } = await seedCuentaBase(orgId);
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-10', { importe: 1000 });
      await crearAsiento(orgId, periodoAbrilId, cajaId, ventasId, '2026-04-10', {
        importe: 500,
        anulado: true,
      });

      const sin = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30', incluirAnulados: 'false' });

      const con = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30', incluirAnulados: 'true' });

      expect(sin.status).toBe(200);
      expect(con.status).toBe(200);
      expect(parseFloat(sin.body.totales.sumasDebe)).toBe(1000);
      expect(parseFloat(con.body.totales.sumasDebe)).toBe(1500);
    });
  });

  // ============================================================
  // REQ-HT-13: Multi-tenant aislamiento (CRÍTICO)
  // ============================================================

  describe('multi-tenant aislamiento (REQ-HT-13, CRÍTICO)', () => {
    it('Tenant A ve solo sus datos, no los del Tenant B', async () => {
      const { token: tokenA, orgId: orgAId } = await seedTenant('org-ht-mt-a');
      const { orgId: orgBId } = await seedTenant('org-ht-mt-b');

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
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });

      expect(resA.status).toBe(200);
      expect(parseFloat(resA.body.totales.sumasDebe)).toBe(8000);
    });
  });

  // ============================================================
  // REQ-HT-16: rango sin movimiento → reporte vacío con 6 cuadres true
  // ============================================================

  describe('rango sin movimiento (REQ-HT-16)', () => {
    it('reporte vacío: lineas=[], totales 0.00, todos los cuadres true', async () => {
      const { token } = await seedTenant('org-ht-vacio');

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });

      expect(res.status).toBe(200);
      expect(res.body.lineas).toEqual([]);
      expect(res.body.totales.sumasDebe).toBe('0.00');
      expect(res.body.totales.sumasHaber).toBe('0.00');
      expect(res.body.totales.saldoDeudor).toBe('0.00');
      expect(res.body.totales.saldoAcreedor).toBe('0.00');
      expect(res.body.cuadres.cuadra).toBe(true);
      expect(res.body.cuadres.cuadraSumas).toBe(true);
      expect(res.body.cuadres.cuadraSaldos).toBe(true);
      expect(res.body.cuadres.cuadraAjustes).toBe(true);
      expect(res.body.cuadres.cuadraSaldosAjustados).toBe(true);
      expect(res.body.cuadres.cuadraEstadoResultados).toBe(true);
      expect(res.body.cuadres.cuadraBalanceGeneral).toBe(true);
      expect(res.body.cuentasNaturalezaOpuesta).toEqual([]);
    });
  });
});
