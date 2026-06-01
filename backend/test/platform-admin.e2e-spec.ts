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

/**
 * Levanta la app con la config estándar del proyecto.
 */
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

/**
 * Logea y devuelve el accessToken.
 */
async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe('Platform Admin — gating (REQ-SA-05, REQ-SA-12..13)', () => {
  let app: INestApplication;
  let ownerToken: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Crear un OWNER normal con su tenant
    const owner = await createTestUser({
      email: 'owner-platform@test.com',
      password: 'pass12345',
    });
    const tenant = await createTestTenant({ name: `Org Owner ${Date.now()}` });
    await createTestMembership(owner.id, tenant.id);
    ownerToken = await login(app, 'owner-platform@test.com', 'pass12345');
  });

  // ---------------------------------------------------------------
  // Casos negativos: gating (van primero — TDD rojo)
  // ---------------------------------------------------------------

  it('[-] OWNER hace GET /admin/platform/orgs → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/orgs')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('[-] OWNER hace POST /admin/platform/orgs → 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/platform/orgs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Nueva Org', modulo: 'OTROS', ownerEmail: 'owner-platform@test.com' });
    expect(res.status).toBe(403);
  });

  it('[-] sin JWT → 401 (JwtAuthGuard actúa antes)', async () => {
    const res = await request(app.getHttpServer()).get('/api/admin/platform/orgs');
    expect(res.status).toBe(401);
  });

  it('[-] sin JWT en POST → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/platform/orgs')
      .send({ name: 'Nueva Org', modulo: 'OTROS', ownerEmail: 'owner-platform@test.com' });
    expect(res.status).toBe(401);
  });
});

describe('Platform Admin — acceso super-admin (REQ-SA-12, REQ-SA-13)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let ownerUserId: string;
  let ownerEmail: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Crear super-admin directamente en BD con isSuperAdmin = true
    const superAdminPassword = 'superpass123';
    const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
    await prisma.user.create({
      data: {
        email: 'superadmin@test.com',
        hashedPassword,
        isSuperAdmin: true,
      },
    });
    superAdminToken = await login(app, 'superadmin@test.com', superAdminPassword);

    // Crear un OWNER que usaremos como ownerEmail en el POST
    ownerEmail = 'owner-to-assign@test.com';
    const owner = await createTestUser({ email: ownerEmail, password: 'pass12345' });
    ownerUserId = owner.id;
    const tenant = await createTestTenant({ name: `Tenant Existente ${Date.now()}` });
    await createTestMembership(ownerUserId, tenant.id);
  });

  it('[+] REQ-SA-12: GET /admin/platform/orgs → 200 con lista de todas las orgs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/platform/orgs')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Debe haber al menos la org del OWNER creado en beforeEach
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('[+] REQ-SA-13: POST /admin/platform/orgs → 201, org creada, ownerEmail queda como OWNER', async () => {
    const orgName = `Org Super Admin ${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/api/admin/platform/orgs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: orgName, modulo: 'OTROS', ownerEmail });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(orgName);

    // Verificar que el ownerEmail tiene una membership OWNER en la nueva org
    const newOrgId = res.body.id as string;
    const membership = await prisma.membership.findFirst({
      where: { organizationId: newOrgId, userId: ownerUserId, systemRole: 'OWNER' },
    });
    expect(membership).not.toBeNull();
  });

  it('[+] REQ-SA-13: cada POST exitoso deja fila en platform_audit', async () => {
    const orgName = `Org Audit ${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/api/admin/platform/orgs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: orgName, modulo: 'OTROS', ownerEmail });

    expect(res.status).toBe(201);

    // El PlatformAuditInterceptor escribe de forma asíncrona (fire-and-forget).
    // Esperamos un momento para que la escritura complete antes de verificar.
    await new Promise((r) => setTimeout(r, 100));

    // El PlatformAuditInterceptor registra la mutación
    const auditRow = await prisma.platformAudit.findFirst({
      where: { action: { contains: 'POST' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
  });

  it('[+] REQ-SA-13: ownerEmail inexistente → 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/platform/orgs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: `Org Sin Owner ${Date.now()}`,
        modulo: 'OTROS',
        ownerEmail: 'no-existe@example.com',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLATFORM_ORG_OWNER_NOT_FOUND');
  });
});

describe('Platform Admin — gating REQ-SA-14/15 (OWNER no puede)', () => {
  let app: INestApplication;
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

    const owner = await createTestUser({
      email: 'owner-gating-6b@test.com',
      password: 'pass12345',
    });
    const tenant = await createTestTenant({ name: `Org Gating 6b ${Date.now()}` });
    await createTestMembership(owner.id, tenant.id);
    orgId = tenant.id;
    ownerToken = await login(app, 'owner-gating-6b@test.com', 'pass12345');
  });

  it('[-] OWNER hace PATCH /admin/platform/orgs/:id/status → 403 (REQ-SA-14)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${orgId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'SUSPENDED' });
    expect(res.status).toBe(403);
  });

  it('[-] OWNER hace PATCH /admin/platform/orgs/:id/entitlement → 403 (REQ-SA-15)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${orgId}/entitlement`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ plan: 'PRO' });
    expect(res.status).toBe(403);
  });

  it('[-] OWNER hace GET /admin/feature-flags → 403 tras re-gating (REQ-SA-16)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/feature-flags')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId);
    expect(res.status).toBe(403);
  });
});

describe('Platform Admin — PATCH status/entitlement super-admin (REQ-SA-14/15)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let targetOrgId: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Super-admin
    const superAdminPassword = 'superpass123';
    const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
    await prisma.user.create({
      data: { email: 'superadmin@test.com', hashedPassword, isSuperAdmin: true },
    });
    superAdminToken = await login(app, 'superadmin@test.com', superAdminPassword);

    // Org objetivo
    const owner = await createTestUser({ email: 'owner-target@test.com', password: 'pass12345' });
    const tenant = await createTestTenant({ name: `Org Target ${Date.now()}` });
    await createTestMembership(owner.id, tenant.id);
    targetOrgId = tenant.id;
  });

  // ---------- PATCH status ----------

  it('[+] REQ-SA-14: PATCH /status SUSPENDED → 200 y status cambia en BD', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUSPENDED');

    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    expect(org?.status).toBe('SUSPENDED');
  });

  it('[+] REQ-SA-14: PATCH /status ACTIVE revierte una suspensión', async () => {
    // Primero suspender
    await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'SUSPENDED' });

    // Luego reactivar
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');

    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    expect(org?.status).toBe('ACTIVE');
  });

  it('[+] REQ-SA-14: PATCH /status deja fila en platform_audit con targetOrganizationId', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ARCHIVED' });

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 150));

    const auditRow = await prisma.platformAudit.findFirst({
      where: { targetOrganizationId: targetOrgId },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.targetOrganizationId).toBe(targetOrgId);
  });

  it('[+] REQ-SA-14: org inexistente → 404', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/admin/platform/orgs/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(404);
  });

  it('[-] status inválido → 400 (ValidationPipe)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'INVALIDO' });

    expect(res.status).toBe(400);
  });

  // ---------- PATCH entitlement ----------

  it('[+] REQ-SA-15: PATCH /entitlement plan PRO → 200 y plan cambia en BD', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/entitlement`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ plan: 'PRO' });

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('PRO');

    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    expect(org?.plan).toBe('PRO');
  });

  it('[+] REQ-SA-15: PATCH /entitlement cambia verticales (granja → contabilidad)', async () => {
    // La org default tiene contabilidadEnabled=true, granjaEnabled=false (createTestTenant).
    // Cambiar a solo granja.
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/entitlement`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ contabilidadEnabled: false, granjaEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.contabilidadEnabled).toBe(false);
    expect(res.body.granjaEnabled).toBe(true);

    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    expect(org?.contabilidadEnabled).toBe(false);
    expect(org?.granjaEnabled).toBe(true);
  });

  it('[-] REQ-SA-15: ambos verticales true → 422 PLATFORM_VERTICAL_NO_EXCLUSIVO', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/entitlement`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ contabilidadEnabled: true, granjaEnabled: true });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLATFORM_VERTICAL_NO_EXCLUSIVO');
  });

  it('[+] REQ-SA-15: PATCH /entitlement deja fila en platform_audit con targetOrganizationId', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${targetOrgId}/entitlement`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ plan: 'PRO' });

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 150));

    const auditRow = await prisma.platformAudit.findFirst({
      where: { targetOrganizationId: targetOrgId },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.targetOrganizationId).toBe(targetOrgId);
  });

  it('[+] REQ-SA-15: org inexistente → 404', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/admin/platform/orgs/00000000-0000-0000-0000-000000000000/entitlement')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ plan: 'PRO' });

    expect(res.status).toBe(404);
  });

  // ---------- Feature flags admin re-gating (REQ-SA-16) ----------

  it('[+] REQ-SA-16: super-admin accede a GET /admin/feature-flags sin X-Tenant-ID → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/feature-flags')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
