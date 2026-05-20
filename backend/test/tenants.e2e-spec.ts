import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { cleanupTestData, createTestUser, prisma } from './helpers/test-factory';

/**
 * E2E spec de `POST /api/tenants`.
 *
 * Cubre validación del DTO (`modulo` requerido y enum), seeding por módulo
 * (flags correctos, 111 cuentas para CONTABILIDAD, cero para GRANJA/OTROS)
 * y aislamiento multi-tenant.
 */
describe('POST /api/tenants (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

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
      const res = await crearTenant({ name: `Org Contabilidad ${Date.now()}`, modulo: 'CONTABILIDAD' });
      expect(res.status).toBe(201);
      expect(res.body.contabilidadEnabled).toBe(true);
      expect(res.body.granjaEnabled).toBe(false);
    });

    it('E-CONT-01 (siembra): después del POST la BD tiene exactamente 111 cuentas para esa organización', async () => {
      const name = `Org Cont Siembra ${Date.now()}`;
      const res = await crearTenant({ name, modulo: 'CONTABILIDAD' });
      expect(res.status).toBe(201);

      const orgId = res.body.id as string;
      const cuentaCount = await prisma.cuenta.count({ where: { organizationId: orgId } });
      expect(cuentaCount).toBe(111);

      const config = await prisma.orgConfiguracionContable.findUnique({
        where: { organizationId: orgId },
      });
      expect(config).not.toBeNull();
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
  // Sin autenticación
  // ---------------------------------------------------------------
  it('rechaza POST sin token → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tenants')
      .send({ name: 'Sin Auth', modulo: 'CONTABILIDAD' });
    expect(res.status).toBe(401);
  });
});
