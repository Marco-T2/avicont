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
 * E2E del endpoint GET /api/eeff/flujo-efectivo (Estado de Flujo de Efectivo —
 * método indirecto, NIC 7).
 *
 * Cubre:
 *   - RBAC: 401 sin token, 403 sin contabilidad.eeff.read, 200 con permiso
 *   - 422 los 4 errores de rango (REQUERIDO/AMBIGUO/INVALIDO/PERIODO_NO_ENCONTRADO)
 *   - Caso funcional: resultado del ejercicio + financiación + conciliación de
 *     efectivo + montos string + fechas YYYY-MM-DD + cuadre
 *   - Señales de calidad (efectivo por heurística)
 *   - Multi-tenant aislamiento (CRÍTICO §4.2)
 *   - Cross-check: efectivoFinal − efectivoInicial == variacionNeta (±0.01)
 */
describe('Estado de Flujo de Efectivo (e2e)', () => {
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
      data: { email: `owner+${slug}@efe.bo`, hashedPassword, isEmailVerified: true },
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
      .send({ email: `owner+${slug}@efe.bo`, password: 'password123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    const gestRes = await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026 });
    expect(gestRes.status).toBe(201);

    const periodoEnero = await prisma.periodoFiscal.findFirstOrThrow({
      where: { organizationId: org.id, year: 2026, month: 1 },
    });

    return { token, orgId: org.id, periodoEneroId: periodoEnero.id };
  }

  async function seedCuentas(orgId: string) {
    const [caja, capital, ventas, costos, resultadoEjercicio, resultadosAcumulados] =
      await Promise.all([
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
        prisma.cuenta.create({
          data: {
            organizationId: orgId,
            codigoInterno: '5.1.1.001',
            nombre: 'Costo de ventas',
            claseCuenta: ClaseCuenta.EGRESO,
            subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
            naturaleza: NaturalezaCuenta.DEUDORA,
            nivel: 4,
            esDetalle: true,
          },
        }),
        prisma.cuenta.create({
          data: {
            organizationId: orgId,
            codigoInterno: '3.2.1.001',
            nombre: 'Resultado del ejercicio',
            claseCuenta: ClaseCuenta.PATRIMONIO,
            subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
            naturaleza: NaturalezaCuenta.ACREEDORA,
            nivel: 4,
            esDetalle: true,
          },
        }),
        prisma.cuenta.create({
          data: {
            organizationId: orgId,
            codigoInterno: '3.2.2.001',
            nombre: 'Resultados acumulados',
            claseCuenta: ClaseCuenta.PATRIMONIO,
            subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
            naturaleza: NaturalezaCuenta.ACREEDORA,
            nivel: 4,
            esDetalle: true,
          },
        }),
      ]);

    return {
      cajaId: caja.id,
      capitalId: capital.id,
      ventasId: ventas.id,
      costosId: costos.id,
      resultadoEjercicioId: resultadoEjercicio.id,
      resultadosAcumuladosId: resultadosAcumulados.id,
    };
  }

  async function crearAsiento(
    orgId: string,
    periodoId: string,
    cuentaDebeId: string,
    cuentaHaberId: string,
    importe: number,
    anulado = false,
  ) {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: orgId,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.CONTABILIZADO,
        numero: `D2601-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: new Date('2026-01-15T00:00:00Z'),
        periodoFiscalId: periodoId,
        glosa: 'Asiento E2E EFE',
        totalDebitoBob: importe,
        totalCreditoBob: importe,
        createdByUserId: 'e2e-user',
        anulado,
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
      const res = await request(app.getHttpServer()).get('/api/eeff/flujo-efectivo');
      expect(res.status).toBe(401);
    });

    it('403 sin permiso contabilidad.eeff.read', async () => {
      const { orgId } = await seedTenant('org-efe-403');

      const hashedPassword = await bcrypt.hash('password123', 10);
      const memberUser = await prisma.user.create({
        data: { email: 'member-efe@efe.bo', hashedPassword, isEmailVerified: true },
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
        .send({ email: 'member-efe@efe.bo', password: 'password123' });
      const memberToken = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${memberToken}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });

      expect(res.status).toBe(403);
    });

    it('200 con permiso y rango válido', async () => {
      const { token } = await seedTenant('org-efe-200');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });

      expect(res.status).toBe(200);
    });
  });

  // ============================================================
  // Validación de rango (los 4 errores 422)
  // ============================================================

  describe('validación de rango', () => {
    it('422 sin ningún modo → REPORTES_FLUJO_EFECTIVO_RANGO_REQUERIDO', async () => {
      const { token } = await seedTenant('org-efe-req');
      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_FLUJO_EFECTIVO_RANGO_REQUERIDO');
    });

    it('422 ambos modos → REPORTES_FLUJO_EFECTIVO_RANGO_AMBIGUO', async () => {
      const { token } = await seedTenant('org-efe-amb');
      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({
          fechaDesde: '2026-01-01',
          fechaHasta: '2026-12-31',
          periodoFiscalId: '11111111-1111-4111-8111-111111111111',
        });
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_FLUJO_EFECTIVO_RANGO_AMBIGUO');
    });

    it('422 desde sin hasta → REPORTES_FLUJO_EFECTIVO_RANGO_INVALIDO', async () => {
      const { token } = await seedTenant('org-efe-inv');
      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01' });
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_FLUJO_EFECTIVO_RANGO_INVALIDO');
    });

    it('422 periodoFiscalId inexistente → REPORTES_FLUJO_EFECTIVO_PERIODO_NO_ENCONTRADO', async () => {
      const { token } = await seedTenant('org-efe-per');
      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: '99999999-9999-4999-8999-999999999999' });
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('REPORTES_FLUJO_EFECTIVO_PERIODO_NO_ENCONTRADO');
    });
  });

  // ============================================================
  // Caso funcional
  // ============================================================

  describe('reporte funcional', () => {
    it('aporte de capital + venta: financiación + operación, conciliación cuadra', async () => {
      const { token, orgId, periodoEneroId } = await seedTenant('org-efe-ok');
      const { cajaId, capitalId, ventasId } = await seedCuentas(orgId);

      // Aporte de capital: Caja 100000 / Capital 100000 (financiación)
      await crearAsiento(orgId, periodoEneroId, cajaId, capitalId, 100000);
      // Venta cobrada en efectivo: Caja 30000 / Ventas 30000 (operación)
      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, 30000);

      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });

      expect(res.status).toBe(200);
      expect(res.body.fechaDesde).toBe('2026-01-01');
      expect(res.body.fechaHasta).toBe('2026-12-31');

      // Resultado del ejercicio = ventas 30000
      expect(res.body.resultadoEjercicio).toBe('30000.00');
      expect(res.body.operacion.subtotal).toBe('30000.00');

      // Financiación = aporte de capital 50000... aquí 100000
      const lineaCapital = res.body.financiacion.lineas.find(
        (l: { codigoInterno: string | null }) => l.codigoInterno === '3.1.1.001',
      );
      expect(lineaCapital).toBeDefined();
      expect(lineaCapital.monto).toBe('100000.00');
      expect(res.body.financiacion.subtotal).toBe('100000.00');

      // Conciliación de efectivo (caja sube 130000)
      expect(res.body.efectivoInicial).toBe('0.00');
      expect(res.body.efectivoFinal).toBe('130000.00');
      expect(res.body.variacionNeta).toBe('130000.00');
      expect(res.body.cuadra).toBe(true);
      expect(res.body.diferencia).toBe('0.00');

      // Cross-check: efectivoFinal − efectivoInicial == variacionNeta
      const delta = Number(res.body.efectivoFinal) - Number(res.body.efectivoInicial);
      expect(Math.abs(delta - Number(res.body.variacionNeta))).toBeLessThanOrEqual(0.01);
    });

    it('resultado trasladado a cuenta patrimonio-resultados NO descuadra el EFE (REQ-FE-08)', async () => {
      const { token, orgId, periodoEneroId } = await seedTenant('org-efe-cierre');
      const { cajaId, ventasId, costosId, resultadoEjercicioId, resultadosAcumuladosId } =
        await seedCuentas(orgId);

      // Venta cobrada en caja: Caja 20000 / Ventas 20000
      await crearAsiento(orgId, periodoEneroId, cajaId, ventasId, 20000);
      // Costos pagados en caja: Costo 12000 / Caja 12000
      await crearAsiento(orgId, periodoEneroId, costosId, cajaId, 12000);
      // Asiento de devengo: traslada el resultado (8000) a la cuenta patrimonial
      // "Resultado del ejercicio" contra "Resultados acumulados", SIN tocar las
      // cuentas de ingreso/egreso (que conservan su saldo del rango → el resultado
      // sigue siendo 8000 calculado desde ingreso/egreso). Esto reproduce el bug:
      // la cuenta patrimonio-resultados varía y NO debe sumarse a financiación.
      const compCierre = await prisma.comprobante.create({
        data: {
          organizationId: orgId,
          tipo: TipoComprobante.AJUSTE,
          estado: EstadoComprobante.CONTABILIZADO,
          numero: `A2601-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
          fechaContable: new Date('2026-01-31T00:00:00Z'),
          periodoFiscalId: periodoEneroId,
          glosa: 'Traslado de resultado al patrimonio E2E',
          totalDebitoBob: 8000,
          totalCreditoBob: 8000,
          createdByUserId: 'e2e-user',
        },
      });
      await prisma.lineaComprobante.createMany({
        data: [
          {
            organizationId: orgId,
            comprobanteId: compCierre.id,
            orden: 1,
            cuentaId: resultadosAcumuladosId,
            moneda: Moneda.BOB,
            debito: 8000,
            credito: 0,
            debitoBob: 8000,
            creditoBob: 0,
          },
          {
            organizationId: orgId,
            comprobanteId: compCierre.id,
            orden: 2,
            cuentaId: resultadoEjercicioId,
            moneda: Moneda.BOB,
            debito: 0,
            credito: 8000,
            debitoBob: 0,
            creditoBob: 8000,
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });

      expect(res.status).toBe(200);
      // El resultado del ejercicio es el punto de partida de operación.
      expect(res.body.resultadoEjercicio).toBe('8000.00');
      // La cuenta patrimonio-resultados NO aparece en financiación.
      const lineaResultado = res.body.financiacion.lineas.find(
        (l: { codigoInterno: string | null }) => l.codigoInterno === '3.2.1.001',
      );
      expect(lineaResultado).toBeUndefined();
      expect(res.body.financiacion.subtotal).toBe('0.00');
      // Conciliación: caja 0 → 8000, sin doble conteo.
      expect(res.body.efectivoInicial).toBe('0.00');
      expect(res.body.efectivoFinal).toBe('8000.00');
      expect(res.body.variacionNeta).toBe('8000.00');
      expect(res.body.cuadra).toBe(true);
      expect(res.body.diferencia).toBe('0.00');
    });

    it('por periodoFiscalId responde 200', async () => {
      const { token, orgId, periodoEneroId } = await seedTenant('org-efe-periodo');
      const { cajaId, capitalId } = await seedCuentas(orgId);
      await crearAsiento(orgId, periodoEneroId, cajaId, capitalId, 5000);

      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ periodoFiscalId: periodoEneroId });

      expect(res.status).toBe(200);
      expect(res.body.fechaDesde).toBe('2026-01-01');
      expect(res.body.fechaHasta).toBe('2026-01-31');
    });

    it('señal de calidad: efectivo identificado por heurística de código', async () => {
      const { token, orgId, periodoEneroId } = await seedTenant('org-efe-heur');
      const { cajaId, capitalId } = await seedCuentas(orgId);
      await crearAsiento(orgId, periodoEneroId, cajaId, capitalId, 1000);

      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });

      expect(res.status).toBe(200);
      expect(res.body.cuentasEfectivoDetectadasPorHeuristica.length).toBeGreaterThan(0);
      expect(res.body.advertencias.some((a: string) => a.toLowerCase().includes('heur'))).toBe(
        true,
      );
    });

    it('toggle incluirAnulados: anulado excluido por default', async () => {
      const { token, orgId, periodoEneroId } = await seedTenant('org-efe-anul');
      const { cajaId, capitalId } = await seedCuentas(orgId);
      await crearAsiento(orgId, periodoEneroId, cajaId, capitalId, 100000);
      await crearAsiento(orgId, periodoEneroId, cajaId, capitalId, 7000, true); // anulado

      const sinAnulados = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });
      expect(sinAnulados.body.efectivoFinal).toBe('100000.00');

      const conAnulados = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31', incluirAnulados: true });
      expect(conAnulados.body.efectivoFinal).toBe('107000.00');
    });
  });

  // ============================================================
  // Multi-tenant aislamiento (§4.2)
  // ============================================================

  describe('aislamiento multi-tenant', () => {
    it('el efectivo de otra org NO aparece', async () => {
      const a = await seedTenant('org-efe-a');
      const ca = await seedCuentas(a.orgId);
      await crearAsiento(a.orgId, a.periodoEneroId, ca.cajaId, ca.capitalId, 77000);

      const b = await seedTenant('org-efe-b');

      const res = await request(app.getHttpServer())
        .get('/api/eeff/flujo-efectivo')
        .set('Authorization', `Bearer ${b.token}`)
        .query({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });

      expect(res.status).toBe(200);
      // La org B no tiene movimientos.
      expect(res.body.efectivoFinal).toBe('0.00');
      expect(res.body.variacionNeta).toBe('0.00');
    });
  });
});
