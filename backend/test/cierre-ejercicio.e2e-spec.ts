import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
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
 * E2E del cierre del ejercicio (REQ-CE-14, REQ-CE-12, REQ-GF-CIERRE-01):
 *   - flujo feliz POST → 3 borradores generadoPorSistema=true → GET preview →
 *     contabilizar los 3 (POST /comprobantes/:id/contabilizar) → cerrar gestión 200.
 *   - RBAC: sin `contabilidad.gestiones.cerrar` → 403.
 *   - Módulo: vertical granja (contabilidad OFF) → 404 (ModuleEnabledGuard).
 *   - Gate de cerrar(): gestión con cierres en BORRADOR → 409.
 *   - Aislamiento multi-tenant: usuario de B no toca la gestión de A.
 *   - Regeneración idempotente: POST dos veces → reemplaza, sin duplicar.
 *   - Gestión CERRADA → 409; inexistente → 404.
 *
 * Boot de AppModule completo: si hubiera un ciclo de carga (comprobantes↔periodos
 * ↔cierre), el `app.init()` crashearía acá (los unit/integration no lo agarran).
 */
describe('CierreEjercicio (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Gestión en un año PASADO: la fecha de los cierres es el último día del
  // mesCierre (31/12/YEAR). Contabilizar rechaza fechas futuras
  // (FechaFuturaNoPermitidaError, §4.6), así que el año debe estar cerrado
  // respecto al reloj del sistema para que el flujo feliz pueda contabilizar.
  const GESTION_YEAR = 2025;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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
  // Helpers de seeding
  // ============================================================

  async function login(email: string, password = 'password123'): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    return res.body.accessToken;
  }

  interface Cuentas {
    transitoria: string;
    acumulados: string;
    ventas: string;
    costo: string;
    sueldos: string;
    caja: string;
  }

  async function crearCuentasYConfig(tenantId: string): Promise<Cuentas> {
    const mk = (
      codigoInterno: string,
      nombre: string,
      claseCuenta: ClaseCuenta,
      subClaseCuenta: SubClaseCuenta,
      naturaleza: NaturalezaCuenta,
    ) =>
      prisma.cuenta.create({
        data: {
          organizationId: tenantId,
          codigoInterno,
          nombre,
          claseCuenta,
          subClaseCuenta,
          naturaleza,
          nivel: 4,
          esDetalle: true,
        },
      });

    const [transitoria, acumulados, ventas, costo, sueldos, caja] = await Promise.all([
      mk(
        '3.1.4.001',
        'RESULTADO DE LA GESTIÓN',
        ClaseCuenta.PATRIMONIO,
        SubClaseCuenta.PATRIMONIO_RESULTADOS,
        NaturalezaCuenta.ACREEDORA,
      ),
      mk(
        '3.1.3.001',
        'RESULTADOS ACUMULADOS',
        ClaseCuenta.PATRIMONIO,
        SubClaseCuenta.PATRIMONIO_RESULTADOS,
        NaturalezaCuenta.ACREEDORA,
      ),
      mk(
        '4.1.1.001',
        'Ventas',
        ClaseCuenta.INGRESO,
        SubClaseCuenta.INGRESO_OPERATIVO,
        NaturalezaCuenta.ACREEDORA,
      ),
      mk(
        '5.1.1.001',
        'Costo de ventas',
        ClaseCuenta.EGRESO,
        SubClaseCuenta.EGRESO_OPERATIVO,
        NaturalezaCuenta.DEUDORA,
      ),
      mk(
        '5.2.1.001',
        'Sueldos',
        ClaseCuenta.EGRESO,
        SubClaseCuenta.EGRESO_ADMINISTRATIVO,
        NaturalezaCuenta.DEUDORA,
      ),
      mk(
        '1.1.1.001',
        'Caja',
        ClaseCuenta.ACTIVO,
        SubClaseCuenta.ACTIVO_CORRIENTE,
        NaturalezaCuenta.DEUDORA,
      ),
    ]);

    await prisma.orgConfiguracionContable.create({
      data: {
        organizationId: tenantId,
        resultadoEjercicioId: transitoria.id,
        resultadosAcumuladosId: acumulados.id,
      },
    });

    return {
      transitoria: transitoria.id,
      acumulados: acumulados.id,
      ventas: ventas.id,
      costo: costo.id,
      sueldos: sueldos.id,
      caja: caja.id,
    };
  }

  /** Gestión GESTION_YEAR con 12 períodos: 1-11 CERRADO, 12 (mesCierre) ABIERTO. */
  async function crearGestion(
    tenantId: string,
  ): Promise<{ gestionId: string; mesCierreId: string; periodo1Id: string }> {
    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year: GESTION_YEAR,
        mesInicio: 1,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    let mesCierreId = '';
    let periodo1Id = '';
    for (let mes = 1; mes <= 12; mes += 1) {
      const periodo = await prisma.periodoFiscal.create({
        data: {
          organizationId: tenantId,
          gestionId: gestion.id,
          year: GESTION_YEAR,
          month: mes,
          ordenEnGestion: mes,
          status: mes === 12 ? PeriodoFiscalStatus.ABIERTO : PeriodoFiscalStatus.CERRADO,
        },
      });
      if (mes === 12) mesCierreId = periodo.id;
      if (mes === 1) periodo1Id = periodo.id;
    }
    return { gestionId: gestion.id, mesCierreId, periodo1Id };
  }

  async function crearMovimiento(
    tenantId: string,
    periodoId: string,
    cuentaDebeId: string,
    cuentaHaberId: string,
    montoBob: number,
  ): Promise<void> {
    const monto = montoBob.toFixed(2);
    await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(GESTION_YEAR, 0, 15)),
        periodoFiscalId: periodoId,
        glosa: 'Movimiento de prueba',
        monedaPrincipal: Moneda.BOB,
        createdByUserId: 'user-seed',
        numero: `D${String(GESTION_YEAR).slice(2)}01-${Math.floor(Math.random() * 900000 + 100000)}`,
        totalDebitoBob: monto,
        totalCreditoBob: monto,
        lineas: {
          create: [
            {
              organizationId: tenantId,
              orden: 1,
              cuentaId: cuentaDebeId,
              moneda: Moneda.BOB,
              debito: monto,
              credito: '0',
              tipoCambio: '1',
              debitoBob: monto,
              creditoBob: '0',
            },
            {
              organizationId: tenantId,
              orden: 2,
              cuentaId: cuentaHaberId,
              moneda: Moneda.BOB,
              debito: '0',
              credito: monto,
              tipoCambio: '1',
              debitoBob: '0',
              creditoBob: monto,
            },
          ],
        },
      },
    });
  }

  /**
   * Org con contabilidad activa, owner, plan de cuentas, config y una gestión con
   * utilidad (Ventas 100k, Costo 60k, Sueldos 20k → +20k). El owner tiene todos
   * los permisos (bypass RBAC).
   */
  async function seedOrgConCierre(
    slug: string,
    email: string,
  ): Promise<{
    ownerToken: string;
    orgId: string;
    gestionId: string;
    mesCierreId: string;
  }> {
    const hashed = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email, hashedPassword: hashed, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: slug,
        contabilidadEnabled: true,
        granjaEnabled: false,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });

    const ctas = await crearCuentasYConfig(org.id);
    const g = await crearGestion(org.id);
    await crearMovimiento(org.id, g.periodo1Id, ctas.caja, ctas.ventas, 100000); // Ventas 100k
    await crearMovimiento(org.id, g.periodo1Id, ctas.costo, ctas.caja, 60000); // Costo 60k
    await crearMovimiento(org.id, g.periodo1Id, ctas.sueldos, ctas.caja, 20000); // Sueldos 20k

    const ownerToken = await login(email);
    return { ownerToken, orgId: org.id, gestionId: g.gestionId, mesCierreId: g.mesCierreId };
  }

  /** Cierra el período del mesCierre (los 1-11 ya están CERRADO en el seed). */
  async function cerrarMesCierre(mesCierreId: string): Promise<void> {
    await prisma.periodoFiscal.update({
      where: { id: mesCierreId },
      data: { status: PeriodoFiscalStatus.CERRADO },
    });
  }

  // ============================================================
  // Flujo feliz
  // ============================================================

  it('flujo feliz: POST genera 3 borradores → GET preview → contabilizar 3 → cerrar gestión 200', async () => {
    const { ownerToken, orgId, gestionId, mesCierreId } = await seedOrgConCierre(
      'org-cierre-feliz',
      'feliz@cierre.bo',
    );

    // POST genera los 3 cierres en BORRADOR.
    const post = await request(app.getHttpServer())
      .post(`/api/gestiones/${gestionId}/cierre`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(post.status).toBe(201);
    expect(post.body.gestionId).toBe(gestionId);
    expect(post.body.cierres).toHaveLength(3);
    for (const c of post.body.cierres) {
      expect(c.estado).toBe(EstadoComprobante.BORRADOR);
    }
    expect(post.body.cierres.map((c: { origenTipo: string }) => c.origenTipo).sort()).toEqual([
      'CIERRE_GASTOS',
      'CIERRE_INGRESOS',
      'CIERRE_RESULTADO',
    ]);

    // generadoPorSistema=true en BD.
    const enBd = await prisma.comprobante.findMany({
      where: { organizationId: orgId, tipo: TipoComprobante.CIERRE },
    });
    expect(enBd).toHaveLength(3);
    expect(enBd.every((c) => c.generadoPorSistema)).toBe(true);

    // GET preview devuelve los 3 sin generarlos de nuevo.
    const get = await request(app.getHttpServer())
      .get(`/api/gestiones/${gestionId}/cierre`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(get.status).toBe(200);
    expect(get.body.cierres).toHaveLength(3);

    // Contabilizar los 3 vía endpoint existente.
    for (const c of post.body.cierres) {
      const ct = await request(app.getHttpServer())
        .post(`/api/comprobantes/${c.id}/contabilizar`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ct.status).toBe(201);
      expect(ct.body.estado).toBe(EstadoComprobante.CONTABILIZADO);
    }

    // Cerrar el mesCierre (los 11 previos ya están CERRADO).
    await cerrarMesCierre(mesCierreId);

    // Cerrar la gestión → OK (gate REQ-GF-CIERRE-01: los 3 cierres CONTABILIZADO).
    const cerrar = await request(app.getHttpServer())
      .post(`/api/gestiones/${gestionId}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(cerrar.status).toBe(201);
    expect(cerrar.body.status).toBe('CERRADA');
  });

  // ============================================================
  // Gate de cerrar() — cierres en BORRADOR
  // ============================================================

  it('cerrar gestión con cierres en BORRADOR → 409 CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO', async () => {
    const { ownerToken, gestionId, mesCierreId } = await seedOrgConCierre(
      'org-cierre-gate',
      'gate@cierre.bo',
    );

    await request(app.getHttpServer())
      .post(`/api/gestiones/${gestionId}/cierre`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    // NO contabilizamos los cierres. Cerramos el mesCierre y la gestión.
    await cerrarMesCierre(mesCierreId);

    const cerrar = await request(app.getHttpServer())
      .post(`/api/gestiones/${gestionId}/cerrar`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(cerrar.status).toBe(409);
    expect(cerrar.body.error.code).toBe('CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO');
  });

  // ============================================================
  // RBAC
  // ============================================================

  it('sin permiso contabilidad.gestiones.cerrar → 403 en POST cierre', async () => {
    const { orgId, gestionId } = await seedOrgConCierre('org-cierre-rbac', 'rbacowner@cierre.bo');

    // Miembro con un rol que tiene read pero NO cerrar.
    const hashed = await bcrypt.hash('password123', 10);
    const limitado = await prisma.user.create({
      data: { email: 'limitado@cierre.bo', hashedPassword: hashed, isEmailVerified: true },
    });
    const rol = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'contador-lector',
        name: 'Contador lector',
        permissions: ['contabilidad.gestiones.read'],
      },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: limitado.id, customRoleId: rol.id },
    });
    const tokenLimitado = await login('limitado@cierre.bo');

    const post = await request(app.getHttpServer())
      .post(`/api/gestiones/${gestionId}/cierre`)
      .set('Authorization', `Bearer ${tokenLimitado}`)
      .set('X-Tenant-ID', orgId);
    expect(post.status).toBe(403);

    // Pero GET (gestiones.read) sí le funciona.
    const get = await request(app.getHttpServer())
      .get(`/api/gestiones/${gestionId}/cierre`)
      .set('Authorization', `Bearer ${tokenLimitado}`)
      .set('X-Tenant-ID', orgId);
    expect(get.status).toBe(200);
  });

  // ============================================================
  // Módulo contabilidad apagado (vertical granja)
  // ============================================================

  it('org con contabilidad OFF (vertical granja) → 404 ModuleEnabledGuard', async () => {
    const hashed = await bcrypt.hash('password123', 10);
    const owner = await prisma.user.create({
      data: { email: 'granjero@cierre.bo', hashedPassword: hashed, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug: 'org-cierre-granja',
        name: 'org-cierre-granja',
        contabilidadEnabled: false,
        granjaEnabled: true,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });
    const g = await crearGestion(org.id);
    const token = await login('granjero@cierre.bo');

    const post = await request(app.getHttpServer())
      .post(`/api/gestiones/${g.gestionId}/cierre`)
      .set('Authorization', `Bearer ${token}`);
    expect(post.status).toBe(404);
  });

  // ============================================================
  // Aislamiento multi-tenant
  // ============================================================

  it('usuario de tenant B no puede generar/ver el cierre de la gestión de A → 404', async () => {
    const a = await seedOrgConCierre('org-cierre-iso-a', 'isoa@cierre.bo');
    const b = await seedOrgConCierre('org-cierre-iso-b', 'isob@cierre.bo');

    const post = await request(app.getHttpServer())
      .post(`/api/gestiones/${a.gestionId}/cierre`)
      .set('Authorization', `Bearer ${b.ownerToken}`)
      .set('X-Tenant-ID', b.orgId);
    expect(post.status).toBe(404);
    expect(post.body.error.code).toBe('CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA');

    // No se crearon cierres en A.
    const count = await prisma.comprobante.count({
      where: { organizationId: a.orgId, tipo: TipoComprobante.CIERRE },
    });
    expect(count).toBe(0);
  });

  // ============================================================
  // Idempotencia
  // ============================================================

  it('POST dos veces regenera sin duplicar (constraint @@unique)', async () => {
    const { ownerToken, orgId, gestionId } = await seedOrgConCierre(
      'org-cierre-idem',
      'idem@cierre.bo',
    );

    await request(app.getHttpServer())
      .post(`/api/gestiones/${gestionId}/cierre`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const primeros = await prisma.comprobante.findMany({
      where: { organizationId: orgId, tipo: TipoComprobante.CIERRE },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .post(`/api/gestiones/${gestionId}/cierre`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const segundos = await prisma.comprobante.findMany({
      where: { organizationId: orgId, tipo: TipoComprobante.CIERRE },
      select: { id: true },
    });

    expect(segundos).toHaveLength(3);
    const viejos = new Set(primeros.map((c) => c.id));
    for (const c of segundos) {
      expect(viejos.has(c.id)).toBe(false);
    }
  });

  // ============================================================
  // Estados de gestión
  // ============================================================

  it('gestión ya CERRADA → 409 CIERRE_EJERCICIO_GESTION_YA_CERRADA', async () => {
    const { ownerToken, orgId, gestionId } = await seedOrgConCierre(
      'org-cierre-cerrada',
      'cerrada@cierre.bo',
    );
    await prisma.gestionFiscal.update({
      where: { id: gestionId },
      data: { status: GestionFiscalStatus.CERRADA },
    });

    const post = await request(app.getHttpServer())
      .post(`/api/gestiones/${gestionId}/cierre`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId);
    expect(post.status).toBe(409);
    expect(post.body.error.code).toBe('CIERRE_EJERCICIO_GESTION_YA_CERRADA');
  });

  it('gestión inexistente → 404 CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA', async () => {
    const { ownerToken, orgId } = await seedOrgConCierre('org-cierre-404', 'nf@cierre.bo');

    const post = await request(app.getHttpServer())
      .post(`/api/gestiones/00000000-0000-4000-8000-000000000000/cierre`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId);
    expect(post.status).toBe(404);
    expect(post.body.error.code).toBe('CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA');
  });
});
