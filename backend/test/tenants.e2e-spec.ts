import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  TIPO_DOCUMENTO_FISICO_SEEDER_PORT,
  TipoDocumentoFisicoSeederPort,
} from '../src/tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port';
import { cleanupTestData, createTestUser, prisma } from './helpers/test-factory';

/**
 * Configura y levanta una INestApplication desde AppModule con los pipes y
 * prefijo estándar del proyecto. Extrae el boilerplate repetido entre suites.
 */
async function buildApp(
  overrides?: (builder: import('@nestjs/testing').TestingModuleBuilder) => void,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (overrides) overrides(builder);
  const moduleFixture: TestingModule = await builder.compile();
  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
  );
  await app.init();
  return app;
}

/**
 * E2E spec de `POST /api/tenants`.
 *
 * Cubre validación del DTO (`modulo` requerido y enum), seeding por módulo
 * (flags correctos, 110 cuentas para CONTABILIDAD, cero para GRANJA/OTROS)
 * y aislamiento multi-tenant.
 */
describe('POST /api/tenants (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Crear usuario autenticado para todos los tests
    const user = await createTestUser({ email: 'tenants-e2e@test.com', password: 'pass12345' });
    void user;
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'tenants-e2e@test.com', password: 'pass12345' });
    expect(loginRes.status).toBe(200);
    accessToken = loginRes.body.accessToken as string;
  });

  async function crearTenant(payload: Record<string, unknown>): Promise<request.Response> {
    return request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);
  }

  // ---------------------------------------------------------------
  // Validación de DTO (E-DTO-01 a E-DTO-04)
  // ---------------------------------------------------------------
  describe('validación de DTO', () => {
    it('E-DTO-01: rechaza POST sin modulo → 400', async () => {
      const res = await crearTenant({ name: 'Org Sin Modulo' });
      expect(res.status).toBe(400);
    });

    it('E-DTO-02: rechaza POST con modulo fuera del enum (FARMACIA) → 400', async () => {
      const res = await crearTenant({ name: 'Org Farmacia', modulo: 'FARMACIA' });
      expect(res.status).toBe(400);
    });

    it('E-DTO-03: rechaza POST con modulo null → 400', async () => {
      const res = await crearTenant({ name: 'Org Null', modulo: null });
      expect(res.status).toBe(400);
    });

    it('E-DTO-04: los tres valores del enum producen 201', async () => {
      const modulos = ['CONTABILIDAD', 'GRANJA', 'OTROS'] as const;
      for (const modulo of modulos) {
        const res = await crearTenant({ name: `Org ${modulo} ${Date.now()}`, modulo });
        expect(res.status).toBe(201);
      }
    });
  });

  // ---------------------------------------------------------------
  // CONTABILIDAD (E-CONT-01)
  // ---------------------------------------------------------------
  describe('modulo CONTABILIDAD', () => {
    it('E-CONT-01: 201 + contabilidadEnabled=true + granjaEnabled=false en respuesta', async () => {
      const res = await crearTenant({
        name: `Org Contabilidad ${Date.now()}`,
        modulo: 'CONTABILIDAD',
      });
      expect(res.status).toBe(201);
      expect(res.body.contabilidadEnabled).toBe(true);
      expect(res.body.granjaEnabled).toBe(false);
    });

    it('E-CONT-01 (siembra): después del POST la BD tiene exactamente 110 cuentas para esa organización', async () => {
      const name = `Org Cont Siembra ${Date.now()}`;
      const res = await crearTenant({ name, modulo: 'CONTABILIDAD' });
      expect(res.status).toBe(201);

      const orgId = res.body.id as string;
      const cuentaCount = await prisma.cuenta.count({ where: { organizationId: orgId } });
      expect(cuentaCount).toBe(110);

      const config = await prisma.orgConfiguracionContable.findUnique({
        where: { organizationId: orgId },
      });
      expect(config).not.toBeNull();
    });

    it('E-CONT-04: después del POST la BD tiene exactamente 8 TipoDocumentoFisico para esa organización', async () => {
      const name = `Org Cont TipoDoc ${Date.now()}`;
      const res = await crearTenant({ name, modulo: 'CONTABILIDAD' });
      expect(res.status).toBe(201);

      const orgId = res.body.id as string;
      const tiposCount = await prisma.tipoDocumentoFisico.count({
        where: { organizationId: orgId },
      });
      expect(tiposCount).toBe(8);
    });
  });

  // ---------------------------------------------------------------
  // GRANJA (E-GRAN-01)
  // ---------------------------------------------------------------
  describe('modulo GRANJA', () => {
    it('E-GRAN-01: 201 + granjaEnabled=true + contabilidadEnabled=false + cero cuentas', async () => {
      const res = await crearTenant({ name: `Org Granja ${Date.now()}`, modulo: 'GRANJA' });
      expect(res.status).toBe(201);
      expect(res.body.granjaEnabled).toBe(true);
      expect(res.body.contabilidadEnabled).toBe(false);

      const orgId = res.body.id as string;
      const cuentaCount = await prisma.cuenta.count({ where: { organizationId: orgId } });
      expect(cuentaCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // OTROS (E-OTROS-01)
  // ---------------------------------------------------------------
  describe('modulo OTROS', () => {
    it('E-OTROS-01: 201 + ambos flags false + cero cuentas', async () => {
      const res = await crearTenant({ name: `Org Otros ${Date.now()}`, modulo: 'OTROS' });
      expect(res.status).toBe(201);
      expect(res.body.contabilidadEnabled).toBe(false);
      expect(res.body.granjaEnabled).toBe(false);

      const orgId = res.body.id as string;
      const cuentaCount = await prisma.cuenta.count({ where: { organizationId: orgId } });
      expect(cuentaCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Aislamiento multi-tenant por módulo (E-MT-03)
  // ---------------------------------------------------------------
  describe('aislamiento de módulo (E-MT-03)', () => {
    // GET base de los 7 controllers gateados con @RequireModule('contabilidad').
    // El ModuleEnabledGuard (APP_GUARD) responde 404 deliberado cuando el módulo
    // está deshabilitado para el tenant activo (el endpoint "no existe" para esa org).
    const endpointsContables = [
      '/api/cuentas',
      '/api/comprobantes',
      '/api/periodos',
      '/api/gestiones',
      '/api/documentos-fisicos',
      '/api/configuracion-contable',
      '/api/tipos-documento-fisico',
    ] as const;

    function getConTenant(path: string, tenantId: string): request.Test {
      return request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-tenant-id', tenantId);
    }

    it.each(endpointsContables)(
      'E-MT-03: una org GRANJA al consultar GET %s recibe 404 (módulo deshabilitado)',
      async (path) => {
        const res = await crearTenant({ name: `Org Granja MT03 ${Date.now()}`, modulo: 'GRANJA' });
        expect(res.status).toBe(201);

        const blocked = await getConTenant(path, res.body.id as string);
        expect(blocked.status).toBe(404);
      },
    );

    it.each(endpointsContables)(
      'E-MT-03 (control): una org CONTABILIDAD al consultar GET %s NO recibe 404 — el 404 es del guard, no de ruta inexistente',
      async (path) => {
        const res = await crearTenant({
          name: `Org Cont MT03 ${Date.now()}`,
          modulo: 'CONTABILIDAD',
        });
        expect(res.status).toBe(201);

        const allowed = await getConTenant(path, res.body.id as string);
        expect(allowed.status).not.toBe(404);
      },
    );
  });

  // ---------------------------------------------------------------
  // Sin autenticación
  // ---------------------------------------------------------------
  it('rechaza POST sin token → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tenants')
      .send({ name: 'Sin Auth', modulo: 'CONTABILIDAD' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------
// Atomicidad del alta (E-ATOM-01) — app con seeder mockeado
// ---------------------------------------------------------------
describe('POST /api/tenants — atomicidad (E-ATOM-01)', () => {
  let appAtom: INestApplication;
  let tokenAtom: string;

  beforeAll(async () => {
    // Override del seeder de tipos de documento físico para forzar fallo
    // dentro de la TX. El plan-cuentas seeder se ejecuta primero (siembra
    // 110 cuentas); este seeder falla justo después: toda la TX debe hacer
    // rollback (org + cuentas + OrgConfiguracionContable deben quedar sin
    // persistir).
    const seederFallido: TipoDocumentoFisicoSeederPort = {
      seedDefaultsForTenant: jest.fn().mockRejectedValue(new Error('seeder-boom-e2e')),
    } as unknown as TipoDocumentoFisicoSeederPort;

    appAtom = await buildApp((builder) => {
      builder.overrideProvider(TIPO_DOCUMENTO_FISICO_SEEDER_PORT).useValue(seederFallido);
    });

    await cleanupTestData();
    await createTestUser({ email: 'atom-e2e@test.com', password: 'pass12345' });
    const loginRes = await request(appAtom.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'atom-e2e@test.com', password: 'pass12345' });
    expect(loginRes.status).toBe(200);
    tokenAtom = loginRes.body.accessToken as string;
  });

  afterAll(async () => {
    await appAtom.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await createTestUser({ email: 'atom-e2e@test.com', password: 'pass12345' });
    const loginRes = await request(appAtom.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'atom-e2e@test.com', password: 'pass12345' });
    expect(loginRes.status).toBe(200);
    tokenAtom = loginRes.body.accessToken as string;
  });

  it('E-ATOM-01: si el seeder falla, la TX hace rollback total — org, cuentas y config no persisten', async () => {
    const orgCount = await prisma.organization.count();

    const res = await request(appAtom.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', `Bearer ${tokenAtom}`)
      .send({ name: `Org Atom Rollback ${Date.now()}`, modulo: 'CONTABILIDAD' });

    // El seeder lanza dentro de la TX → el endpoint devuelve 5xx
    expect(res.status).toBeGreaterThanOrEqual(500);

    // La org NO debe haberse persistido (rollback total)
    const orgCountAfter = await prisma.organization.count();
    expect(orgCountAfter).toBe(orgCount);

    // Sin cuentas huérfanas (el plan-cuentas seeder corrió antes del fallo)
    const cuentaCount = await prisma.cuenta.count();
    expect(cuentaCount).toBe(0);

    // Sin OrgConfiguracionContable huérfana
    const configCount = await prisma.orgConfiguracionContable.count();
    expect(configCount).toBe(0);
  });
});
