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
 * E2E del endpoint GET /api/eeff/resultados.
 *
 * Cubre:
 *   - REQ-ER-01: tres formas de rango, validación
 *   - REQ-ER-02: flujo sin arrastre histórico (CRÍTICO)
 *   - REQ-ER-03: BORRADOR excluido
 *   - REQ-ER-04: toggle incluirAnulados
 *   - REQ-ER-05: saldo neto por naturaleza
 *   - REQ-ER-06: esContraria resta del grupo (CRÍTICO)
 *   - REQ-ER-07: cuenta con saldo 0 ausente
 *   - REQ-ER-08: Resultado del Ejercicio + coincidencia con Balance (CRÍTICO)
 *   - REQ-ER-09: estructura árbol Ingreso/Egreso
 *   - REQ-ER-10: multi-tenant aislamiento (CRÍTICO)
 *   - REQ-ER-11: RBAC contabilidad.eeff.read
 *   - REQ-ER-12: montos como strings "NNN.NN", fechas "YYYY-MM-DD"
 */
describe('Estado de Resultados (e2e)', () => {
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
      data: { email: `owner+${slug}@er.bo`, hashedPassword, isEmailVerified: true },
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
      .send({ email: `owner+${slug}@er.bo`, password: 'password123' });
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

  /** Crea cuentas Caja (ACTIVO) + Ventas (INGRESO) para el tenant. */
  async function seedCuentasBase(orgId: string) {
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

  /** Crea un comprobante contabilizado. */
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
        numero: `D2601-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: new Date(`${fechaContable}T00:00:00Z`),
        periodoFiscalId: periodoId,
        glosa: 'Asiento E2E Estado Resultados',
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
  // REQ-ER-11: RBAC
  // ============================================================

  describe('RBAC (REQ-ER-11)', () => {
    it('401 sin JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });
      expect(res.status).toBe(401);
    });

    it('403 sin permiso contabilidad.eeff.read', async () => {
      const { token: ownerToken, orgId } = await seedTenant('org-er-403');

      const hashedPassword = await bcrypt.hash('password123', 10);
      const memberUser = await prisma.user.create({
        data: { email: 'member-er@er.bo', hashedPassword, isEmailVerified: true },
      });
      const role = await prisma.customRole.create({
        data: {
          organizationId: orgId,
          slug: 'sin-eeff-er',
          name: 'Sin EEFF',
          permissions: ['contabilidad.asientos.read'],
        },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: memberUser.id, customRoleId: role.id },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'member-er@er.bo', password: 'password123' });
      expect(loginRes.status).toBe(200);
      const memberToken = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(403);
      void ownerToken;
    });

    it('200 con JWT válido, permiso y rango válido', async () => {
      const { token } = await seedTenant('org-er-200');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
    });
  });

  // ============================================================
  // REQ-ER-01: Validación de rango
  // ============================================================

  describe('validación de rango (REQ-ER-01)', () => {
    it('400 sin ningún parámetro → REPORTES_RESULTADOS_RANGO_INVALIDO', async () => {
      const { token } = await seedTenant('org-er-400-noparams');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('REPORTES_RESULTADOS_RANGO_INVALIDO');
    });

    it('400 fechaDesde > fechaHasta → REPORTES_RESULTADOS_RANGO_INVALIDO', async () => {
      const { token } = await seedTenant('org-er-400-range');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-06-01', fechaHasta: '2026-05-01' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('REPORTES_RESULTADOS_RANGO_INVALIDO');
    });

    it('422 periodoFiscalId inexistente → REPORTES_RESULTADOS_SIN_PERIODO', async () => {
      const { token } = await seedTenant('org-er-422-periodo');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: '00000000-0000-4000-8000-000000000001' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_RESULTADOS_SIN_PERIODO');
    });

    it('422 gestionId inexistente → REPORTES_RESULTADOS_SIN_GESTION', async () => {
      const { token } = await seedTenant('org-er-422-gestion');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ gestionId: '00000000-0000-4000-8000-000000000002' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_RESULTADOS_SIN_GESTION');
    });
  });

  // ============================================================
  // REQ-ER-10: Tenant sin comprobantes → resultado cero
  // ============================================================

  describe('tenant sin comprobantes (REQ-ER-10)', () => {
    it('200 con totalIngresoBob "0.00", totalEgresoBob "0.00", resultadoEjercicioBob "0.00"', async () => {
      const { token } = await seedTenant('org-er-vacio');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.totalIngresoBob).toBe('0.00');
      expect(res.body.totalEgresoBob).toBe('0.00');
      expect(res.body.resultadoEjercicioBob).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-ER-12: Forma del DTO
  // ============================================================

  describe('forma del DTO (REQ-ER-12)', () => {
    it('montos como strings "NNN.NN", fechaDesde y fechaHasta como "YYYY-MM-DD"', async () => {
      const { token, orgId } = await seedTenant('org-er-dto');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentasBase(orgId);
      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15', { importe: 1250 });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.fechaDesde).toBe('2026-01-01');
      expect(res.body.fechaHasta).toBe('2026-01-31');
      expect(typeof res.body.totalIngresoBob).toBe('string');
      expect(typeof res.body.totalEgresoBob).toBe('string');
      expect(typeof res.body.resultadoEjercicioBob).toBe('string');
    });

    it('respuesta tiene secciones ingreso y egreso con claseCuenta correcta (REQ-ER-09)', async () => {
      const { token } = await seedTenant('org-er-secciones');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.ingreso).toBeDefined();
      expect(res.body.ingreso.claseCuenta).toBe('INGRESO');
      expect(res.body.egreso).toBeDefined();
      expect(res.body.egreso.claseCuenta).toBe('EGRESO');
    });
  });

  // ============================================================
  // REQ-ER-03: BORRADOR excluido
  // ============================================================

  describe('BORRADOR excluido (REQ-ER-03)', () => {
    it('BORRADOR no contribuye al flujo de ingresos', async () => {
      const { token, orgId } = await seedTenant('org-er-borrador');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentasBase(orgId);

      // Solo BORRADOR — no debe aparecer
      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15', {
        importe: 5000,
        estado: EstadoComprobante.BORRADOR,
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.totalIngresoBob).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-ER-04: Toggle incluirAnulados
  // ============================================================

  describe('toggle incluirAnulados (REQ-ER-04)', () => {
    it('incluirAnulados=true: anulado contribuye al flujo', async () => {
      const { token, orgId } = await seedTenant('org-er-anulado');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentasBase(orgId);

      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10', { importe: 3000 });
      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, '2026-01-10', {
        importe: 2000,
        anulado: true,
      });

      const sinAnulados = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31', incluirAnulados: 'false' });

      const conAnulados = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31', incluirAnulados: 'true' });

      expect(sinAnulados.status).toBe(200);
      expect(conAnulados.status).toBe(200);
      // Sin anulados: solo 3000; con anulados: 5000
      expect(parseFloat(sinAnulados.body.totalIngresoBob)).toBe(3000);
      expect(parseFloat(conAnulados.body.totalIngresoBob)).toBe(5000);
    });
  });

  // ============================================================
  // REQ-ER-06: esContraria resta del grupo (CRÍTICO)
  // ============================================================

  describe('esContraria resta del Ingreso (REQ-ER-06, CRÍTICO)', () => {
    it('cuenta contraria (devoluciones) RESTA del Ingreso total', async () => {
      const { token, orgId } = await seedTenant('org-er-contraria');

      const periodoEnero = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 1 },
      });

      // Caja (ACTIVO, para ser el destino del débito en los asientos)
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

      // Ventas (INGRESO_OPERATIVO, ACREEDORA)
      const ventas = await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
          esContraria: false,
        },
      });

      // Devoluciones (INGRESO_OPERATIVO, ACREEDORA, esContraria=true)
      const devoluciones = await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '4.1.1.002',
          nombre: 'Devoluciones sobre Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
          esContraria: true,
        },
      });

      // Asiento: Ventas 30000 (caja debe, ventas haber)
      await crearAsiento(orgId, periodoEnero.id, caja.id, ventas.id, '2026-01-10', {
        importe: 30000,
      });
      // Asiento: Devoluciones 2000 (caja debe, devoluciones haber)
      await crearAsiento(orgId, periodoEnero.id, caja.id, devoluciones.id, '2026-01-15', {
        importe: 2000,
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      // Ventas (30000) - Devoluciones (2000) = 28000
      expect(parseFloat(res.body.totalIngresoBob)).toBe(28000);

      // La cuenta contraria debe estar marcada
      const subseccion = res.body.ingreso?.subsecciones?.find(
        (s: { subClaseCuenta: string }) => s.subClaseCuenta === 'INGRESO_OPERATIVO',
      );
      expect(subseccion).toBeDefined();
      const devolucionesDto = subseccion?.cuentas?.find(
        (c: { nombre: string }) => c.nombre === 'Devoluciones sobre Ventas',
      );
      expect(devolucionesDto).toBeDefined();
      expect(devolucionesDto?.esContraria).toBe(true);
    });
  });

  // ============================================================
  // REQ-ER-02: Flujo sin arrastre histórico (CRÍTICO)
  // ============================================================

  describe('flujo sin arrastre histórico (REQ-ER-02, CRÍTICO)', () => {
    it('comprobante antes del rango NO contribuye al flujo', async () => {
      const { token, orgId } = await seedTenant('org-er-flujo');
      const { cajaId, ventasId, periodoEneroId } = await seedCuentasBase(orgId);

      // Este asiento es de enero, fuera del rango mayo
      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, '2026-01-15', { importe: 10000 });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-05-01', fechaHasta: '2026-05-31' });

      expect(res.status).toBe(200);
      // El comprobante de enero no debe aparecer en mayo
      expect(res.body.totalIngresoBob).toBe('0.00');
    });
  });

  // ============================================================
  // REQ-ER-07: Cuenta hoja con saldo 0 ausente
  // ============================================================

  describe('cuenta hoja con saldo 0 ausente (REQ-ER-07)', () => {
    it('cuenta sin movimiento en el rango no aparece en el reporte', async () => {
      const { token, orgId } = await seedTenant('org-er-cero');

      // Solo crear la cuenta pero sin asientos en el rango
      await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '5.2.01',
          nombre: 'Depreciación',
          claseCuenta: ClaseCuenta.EGRESO,
          subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.egreso.subsecciones).toHaveLength(0);
    });
  });

  // ============================================================
  // REQ-ER-08: Resultado del Ejercicio (+ coincidencia Balance, CRÍTICO)
  // ============================================================

  describe('Resultado del Ejercicio (REQ-ER-08)', () => {
    it('resultado positivo (utilidad): resultadoEjercicioBob correcto + esGanancia=true', async () => {
      const { token, orgId } = await seedTenant('org-er-utilidad');

      const periodoEnero = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 1 },
      });

      // Caja para asientos
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
      const ventas = await prisma.cuenta.create({
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
      });
      const costos = await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '5.1.1.001',
          nombre: 'Costo de Ventas',
          claseCuenta: ClaseCuenta.EGRESO,
          subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      });

      // Ingresos: 50000
      await crearAsiento(orgId, periodoEnero.id, caja.id, ventas.id, '2026-01-10', {
        importe: 50000,
      });
      // Egresos: 35000
      await crearAsiento(orgId, periodoEnero.id, costos.id, caja.id, '2026-01-15', {
        importe: 35000,
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.resultadoEjercicioBob).toBe('15000.00');
      expect(res.body.esGanancia).toBe(true);
    });

    it('resultado negativo (pérdida): resultadoEjercicioBob negativo + esGanancia=false', async () => {
      const { token, orgId } = await seedTenant('org-er-perdida');

      const periodoEnero = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 1 },
      });

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
      const ventas = await prisma.cuenta.create({
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
      });
      const costos = await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '5.1.1.001',
          nombre: 'Costos',
          claseCuenta: ClaseCuenta.EGRESO,
          subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      });

      // Ingresos 20000, Egresos 30000 → pérdida -10000
      await crearAsiento(orgId, periodoEnero.id, caja.id, ventas.id, '2026-01-10', {
        importe: 20000,
      });
      await crearAsiento(orgId, periodoEnero.id, costos.id, caja.id, '2026-01-15', {
        importe: 30000,
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(res.status).toBe(200);
      expect(res.body.resultadoEjercicioBob).toBe('-10000.00');
      expect(res.body.esGanancia).toBe(false);
    });

    it('CRÍTICO: coincidencia Balance vs Estado de Resultados para el mismo rango (REQ-ER-08)', async () => {
      const { token, orgId } = await seedTenant('org-er-coincidencia');

      const periodoEnero = await prisma.periodoFiscal.findFirstOrThrow({
        where: { organizationId: orgId, year: 2026, month: 1 },
      });

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
      const ventas = await prisma.cuenta.create({
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
      });
      const costos = await prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '5.1.1.001',
          nombre: 'Costos',
          claseCuenta: ClaseCuenta.EGRESO,
          subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      });

      // Ingresos 50000, Egresos 20000 → Resultado 30000
      await crearAsiento(orgId, periodoEnero.id, caja.id, ventas.id, '2026-01-10', {
        importe: 50000,
      });
      await crearAsiento(orgId, periodoEnero.id, costos.id, caja.id, '2026-01-15', {
        importe: 20000,
      });

      // Consultar Estado de Resultados para enero 2026
      const erRes = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      // Consultar Balance con fecha fin de enero 2026
      const balanceRes = await request(app.getHttpServer())
        .get('/api/eeff/balance')
        .set('Authorization', `Bearer ${token}`)
        .query({ fecha: '2026-01-31' });

      expect(erRes.status).toBe(200);
      expect(balanceRes.status).toBe(200);

      // CRÍTICO: Resultado del Ejercicio debe coincidir en ambos reportes
      // NCB: ambos usan obtenerSaldosEnRango — coincidencia por construcción.
      expect(erRes.body.resultadoEjercicioBob).toBe(balanceRes.body.resultadoEjercicioBob);
    });
  });

  // ============================================================
  // REQ-ER-10: Multi-tenant (CRÍTICO)
  // ============================================================

  describe('multi-tenant aislamiento (REQ-ER-10, CRÍTICO)', () => {
    it('Tenant A (Ingresos 100000) no ve datos del Tenant B (Ingresos 300000)', async () => {
      const { token: tokenA, orgId: orgAId } = await seedTenant('org-er-mt-a');
      const { token: _tokenB, orgId: orgBId } = await seedTenant('org-er-mt-b');

      // Tenant A
      const {
        cajaId: cajaAId,
        ventasId: ventasAId,
        periodoEneroId: periodoAId,
      } = await seedCuentasBase(orgAId);
      await crearAsiento(orgAId, periodoAId, cajaAId, ventasAId, '2026-01-15', { importe: 100000 });

      // Tenant B
      const {
        cajaId: cajaBId,
        ventasId: ventasBId,
        periodoEneroId: periodoBId,
      } = await seedCuentasBase(orgBId);
      await crearAsiento(orgBId, periodoBId, cajaBId, ventasBId, '2026-01-15', { importe: 300000 });

      // Tenant A consulta su Estado de Resultados
      const resA = await request(app.getHttpServer())
        .get('/api/eeff/resultados')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });

      expect(resA.status).toBe(200);
      // Tenant A debe ver SOLO sus ingresos (100000), no los de Tenant B (300000)
      expect(parseFloat(resA.body.totalIngresoBob)).toBe(100000);
    });
  });
});
