import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ActivityCursor } from '../src/platform/lib/activity-cursor';
import {
  cleanupTestData,
  createTestTenant,
  createTestUser,
  prisma,
} from './helpers/test-factory';

async function buildApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
  );
  await app.init();
  return app;
}

async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/**
 * E2E: Platform Dashboard + Activity (REQ-PCT-01..05)
 */
describe('Platform Dashboard — GET /admin/platform/dashboard', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    const saPass = 'superpass123';
    await prisma.user.create({
      data: { email: 'sa-dash@test.com', hashedPassword: await bcrypt.hash(saPass, 10), isSuperAdmin: true },
    });
    superAdminToken = await login(app, 'sa-dash@test.com', saPass);

    const ownerPass = 'ownerpass123';
    const owner = await createTestUser({ email: 'owner-dash@test.com', password: ownerPass });
    const tenant = await createTestTenant({ name: `Org Dashboard ${Date.now()}` });
    await prisma.membership.create({
      data: { userId: owner.id, organizationId: tenant.id, systemRole: 'OWNER' },
    });
    ownerToken = await login(app, 'owner-dash@test.com', ownerPass);
  });

  it('[+] REQ-PCT-01: SA GET /admin/platform/dashboard → 200 con shape correcta', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/dashboard')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);

    // Shape del cuerpo
    expect(Array.isArray(res.body.orgsPorStatus)).toBe(true);
    expect(Array.isArray(res.body.orgsPorPlan)).toBe(true);
    expect(Array.isArray(res.body.orgsPorVertical)).toBe(true);
    expect(typeof res.body.usuarios?.total).toBe('number');
    expect(Array.isArray(res.body.altasPorMes)).toBe(true);
    expect(res.body.altasPorMes).toHaveLength(12);
  });

  it('[+] REQ-PCT-01: altasPorMes tiene entries con year/month/count', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/dashboard')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);

    const entry = res.body.altasPorMes[0];
    expect(typeof entry?.year).toBe('number');
    expect(typeof entry?.month).toBe('number');
    expect(typeof entry?.count).toBe('number');
  });

  it('[+] cross-tenant: dashboard agrega ≥1 org (la creada en beforeEach)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/dashboard')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);

    // Debe haber al menos 1 org en el conteo de status
    const totalOrgs = (res.body.orgsPorStatus as { count: number }[]).reduce(
      (acc, s) => acc + s.count,
      0,
    );
    expect(totalOrgs).toBeGreaterThanOrEqual(1);
  });

  it('[-] no-SA GET /admin/platform/dashboard → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('[-] sin token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/admin/platform/dashboard');
    expect(res.status).toBe(401);
  });
});

describe('Platform Activity — GET /admin/platform/activity', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let ownerToken: string;
  let actorId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    const saPass = 'superpass-activity';
    const sa = await prisma.user.create({
      data: {
        email: 'sa-activity@test.com',
        hashedPassword: await bcrypt.hash(saPass, 10),
        isSuperAdmin: true,
      },
    });
    actorId = sa.id;
    superAdminToken = await login(app, 'sa-activity@test.com', saPass);

    const ownerPass = 'owner-activity-pass';
    const owner = await createTestUser({ email: 'owner-activity@test.com', password: ownerPass });
    const orgA = await createTestTenant({ name: `Org Activity A ${Date.now()}` });
    const orgB = await createTestTenant({ name: `Org Activity B ${Date.now()}` });
    orgAId = orgA.id;
    orgBId = orgB.id;
    await prisma.membership.create({
      data: { userId: owner.id, organizationId: orgA.id, systemRole: 'OWNER' },
    });
    ownerToken = await login(app, 'owner-activity@test.com', ownerPass);
  });

  async function createAuditRow(orgId?: string): Promise<void> {
    await prisma.platformAudit.create({
      data: {
        actorUserId: actorId,
        action: 'test-action',
        ...(orgId !== undefined ? { targetOrganizationId: orgId } : {}),
        payload: { secret: 'must-not-appear' },
      },
    });
    // Pequeño delay para createdAt distintos
    await new Promise((r) => setTimeout(r, 2));
  }

  it('[+] SA GET /admin/platform/activity → 200 con shape correcta', async () => {
    await createAuditRow(orgAId);

    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/activity')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect('nextCursor' in res.body).toBe(true);
  });

  it('[+] REQ-PCT-04: payload NUNCA aparece en los ítems', async () => {
    await createAuditRow(orgAId);

    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/activity')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const item = res.body.items[0];
    expect(Object.prototype.hasOwnProperty.call(item, 'payload')).toBe(false);
  });

  it('[+] actor y org se resuelven en la respuesta', async () => {
    await createAuditRow(orgAId);

    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/activity')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const item = res.body.items[0];
    expect(item?.actor?.email).toBe('sa-activity@test.com');
    expect(item?.targetOrganizationId).toBe(orgAId);
    expect(item?.targetOrganization?.name).toBeTruthy();
  });

  it('[+] paginación page1→page2 sin solapamiento (REQ-PCT-03)', async () => {
    // Crear 5 registros
    for (let i = 0; i < 5; i++) {
      await createAuditRow(orgAId);
    }

    const page1 = await request(app.getHttpServer())
      .get('/api/admin/platform/activity?limit=3')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(3);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app.getHttpServer())
      .get(`/api/admin/platform/activity?limit=3&cursor=${page1.body.nextCursor}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(page2.status).toBe(200);
    expect(page2.body.items.length).toBeGreaterThanOrEqual(2);
    expect(page2.body.nextCursor).toBeNull();

    const idsP1 = page1.body.items.map((i: { id: string }) => i.id) as string[];
    const idsP2 = page2.body.items.map((i: { id: string }) => i.id) as string[];
    const overlap = idsP1.filter((id) => idsP2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('[+] filtro orgId → solo ítems de esa org', async () => {
    await createAuditRow(orgAId);
    await createAuditRow(orgAId);
    await createAuditRow(orgBId);

    const res = await request(app.getHttpServer())
      .get(`/api/admin/platform/activity?orgId=${orgAId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    res.body.items.forEach((item: { targetOrganizationId: string }) => {
      expect(item.targetOrganizationId).toBe(orgAId);
    });
  });

  it('[+] orgId inexistente → 200 con items vacío y nextCursor null (REQ-PCT-03)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/activity?orgId=00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.nextCursor).toBeNull();
  });

  it('[-] cursor inválido → 400 PLATFORM_ACTIVITY_CURSOR_INVALIDO (REQ-PCT-03)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/activity?cursor=not-a-valid-cursor!!!')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('PLATFORM_ACTIVITY_CURSOR_INVALIDO');
  });

  it('[-] limit fuera de rango → 400 (ValidationPipe)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/activity?limit=200')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
  });

  it('[-] no-SA → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/activity')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('[-] sin token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/admin/platform/activity');
    expect(res.status).toBe(401);
  });

  it('[+] cross-tenant: activity agrega ≥1 org (REQ-PCT-03)', async () => {
    await createAuditRow(orgAId);
    await createAuditRow(orgBId);

    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/activity')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);

    const orgIds = res.body.items
      .filter((i: { targetOrganizationId: string | null }) => i.targetOrganizationId !== null)
      .map((i: { targetOrganizationId: string }) => i.targetOrganizationId);
    const uniqueOrgs = new Set(orgIds);
    expect(uniqueOrgs.size).toBeGreaterThanOrEqual(2);
  });
});
