import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  cleanupTestData,
  createTestMembership,
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

describe('Platform Members — REQ-PM-01: GET /admin/platform/orgs/:id/members', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let ownerToken: string;
  let orgId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Crear super-admin
    const superAdminPassword = 'superpass123';
    const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
    await prisma.user.create({
      data: {
        email: 'superadmin-members@test.com',
        hashedPassword,
        isSuperAdmin: true,
      },
    });
    superAdminToken = await login(app, 'superadmin-members@test.com', superAdminPassword);

    // Crear org con OWNER
    const owner = await createTestUser({
      email: 'owner-members@test.com',
      password: 'ownerpass123',
    });
    const tenant = await createTestTenant({ name: `Org Members ${Date.now()}` });
    await createTestMembership(owner.id, tenant.id);
    orgId = tenant.id;
    ownerToken = await login(app, 'owner-members@test.com', 'ownerpass123');

    // Agregar un miembro ADMIN activo
    const adminUser = await createTestUser({
      email: 'admin-member@test.com',
      password: 'adminpass123',
    });
    await createTestMembership(adminUser.id, tenant.id, 'ADMIN' as never);

    // Agregar un miembro desactivado
    const { SystemRole } = await import('@prisma/client');
    const deactivatedUser = await createTestUser({
      email: 'deactivated-member@test.com',
      password: 'deactivatedpass123',
    });
    await prisma.membership.create({
      data: {
        userId: deactivatedUser.id,
        organizationId: tenant.id,
        systemRole: SystemRole.ADMIN,
        deactivatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
  });

  it('[+] SA lista miembros de org existente → 200 con array (activos + desactivados)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/platform/orgs/${orgId}/members`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // 3 miembros: OWNER + ADMIN activo + ADMIN desactivado
    expect(res.body.length).toBe(3);

    // Verificar shape del DTO
    const member = res.body[0] as Record<string, unknown>;
    expect(member).toHaveProperty('id');
    expect(member).toHaveProperty('userId');
    expect(member).toHaveProperty('systemRole');
    expect(member).toHaveProperty('customRoleId');
    expect(member).toHaveProperty('customRole');
    expect(member).toHaveProperty('deactivatedAt');
    expect(member).toHaveProperty('createdAt');
    expect(member).toHaveProperty('user');

    const user = member['user'] as Record<string, unknown>;
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('displayName');

    // Verificar que el miembro desactivado tiene deactivatedAt no nulo
    const miembros = res.body as Array<Record<string, unknown>>;
    const desactivado = miembros.find((m) => m['deactivatedAt'] !== null);
    expect(desactivado).toBeDefined();
  });

  it('[+] fila en platform_audit con targetOrganizationId = org.id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/platform/orgs/${orgId}/members`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);

    // PlatformAuditInterceptor escribe de forma async (fire-and-forget)
    await new Promise((r) => setTimeout(r, 150));

    const auditRow = await prisma.platformAudit.findFirst({
      where: { targetOrganizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.targetOrganizationId).toBe(orgId);
  });

  it('[-] org inexistente → 404 PLATFORM_ORG_NO_ENCONTRADA', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/orgs/00000000-0000-0000-0000-000000000000/members')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PLATFORM_ORG_NO_ENCONTRADA');
  });

  it('[-] usuario OWNER sin isSuperAdmin → 403', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/platform/orgs/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
  });

  it('[-] sin token → 401', async () => {
    const res = await request(app.getHttpServer()).get(`/api/admin/platform/orgs/${orgId}/members`);

    expect(res.status).toBe(401);
  });
});
