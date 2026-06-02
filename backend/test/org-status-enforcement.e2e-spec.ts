import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { RedisService } from '../src/cache/redis.service';
import { cleanupTestData, prisma } from './helpers/test-factory';

async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/**
 * E2E: Enforcement de Organization.status via OrgStatusGuard (APP_GUARD).
 *
 * Usa PATCH /api/tenants/current como endpoint de mutación representativo.
 * Los OWNERs tienen wildcard de permisos, así que no hay bloqueo por RBAC.
 *
 * Scenario A: PATCH en org ACTIVE → 200 (no bloqueada)
 * Scenario B: GET en org SUSPENDED → 200 (lectura siempre pasa)
 * Scenario C: PATCH en org SUSPENDED → 403, code ORG_STATUS_NO_ACTIVE
 * Scenario D: DELETE en org ARCHIVED → 403, details.status='ARCHIVED'
 * Scenario E: SA + acción en org SUSPENDED → no-403
 * Scenario F: cambio status → siguiente PATCH → 403 (caché invalidado)
 */
describe('OrgStatusGuard — enforcement de status (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let redis: RedisService;

  const saEmail = `sa-org-status-${Date.now()}@avicont.bo`;
  const saPassword = 'SuperAdminPass1!';
  const ownerPassword = 'OwnerPass1!';

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();

    redis = moduleFixture.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  // Helpers para crear usuarios con contraseñas hasheadas
  async function crearOwnerConOrg(
    email: string,
    orgStatus: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' = 'ACTIVE',
  ): Promise<{ orgId: string; token: string }> {
    const hashedPassword = await bcrypt.hash(ownerPassword, 10);
    const owner = await prisma.user.create({
      data: { email, hashedPassword },
    });
    const org = await prisma.organization.create({
      data: {
        name: `Org ${email}`,
        slug: `org-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: orgStatus,
        memberships: { create: { userId: owner.id, systemRole: 'OWNER' } },
      },
    });
    const token = await login(app, email, ownerPassword);
    return { orgId: org.id, token };
  }

  async function crearSuperAdmin(): Promise<string> {
    const hashedPassword = await bcrypt.hash(saPassword, 10);
    await prisma.user.create({
      data: { email: saEmail, hashedPassword, isSuperAdmin: true },
    });
    return login(app, saEmail, saPassword);
  }

  // Scenario A: mutación en org ACTIVE → permitida
  it('Scenario A: PATCH en org ACTIVE → 200 (no bloqueada por OrgStatusGuard)', async () => {
    const { token } = await crearOwnerConOrg(`owner-a-${Date.now()}@avicont.bo`, 'ACTIVE');

    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nombre Actualizado' });

    // 200 = guard pasó, request llegó al handler
    expect(res.status).toBe(200);
  });

  // Scenario B: GET en org SUSPENDED → permitida (lectura)
  it('Scenario B: GET en org SUSPENDED → 200 (lecturas siempre permitidas)', async () => {
    const { token } = await crearOwnerConOrg(`owner-b-${Date.now()}@avicont.bo`, 'SUSPENDED');

    const res = await request(app.getHttpServer())
      .get('/api/tenants/current')
      .set('Authorization', `Bearer ${token}`);

    // Guard transparente para GET
    expect(res.status).toBe(200);
  });

  // Scenario C: POST/PATCH en org SUSPENDED → 403 con código correcto
  it('Scenario C: PATCH en org SUSPENDED → 403 con code ORG_STATUS_NO_ACTIVE', async () => {
    const { token } = await crearOwnerConOrg(`owner-c-${Date.now()}@avicont.bo`, 'SUSPENDED');

    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Intento Fallido' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_STATUS_NO_ACTIVE');
    expect(typeof res.body.error.message).toBe('string');
    // El mensaje debe estar en español
    expect(res.body.error.message).toMatch(/organización/i);
  });

  // Scenario D: DELETE en org ARCHIVED → 403 con details.status='ARCHIVED'
  it('Scenario D: DELETE en org ARCHIVED → 403, details.status=ARCHIVED', async () => {
    const { token } = await crearOwnerConOrg(`owner-d-${Date.now()}@avicont.bo`, 'ARCHIVED');

    // Usar un endpoint DELETE — usamos /invitations/:id con un UUID ficticio.
    // El guard corre ANTES de que el handler valide si el recurso existe,
    // por lo que el 403 del guard gana sobre el 404 de recurso.
    const res = await request(app.getHttpServer())
      .delete('/api/invitations/11111111-2222-4333-8444-555555555555')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_STATUS_NO_ACTIVE');
    expect(res.body.error.details?.status).toBe('ARCHIVED');
  });

  // Scenario E: SuperAdmin + PATCH en org SUSPENDED → no bloqueado (SA org-less)
  it('Scenario E: SA muta en org SUSPENDED → no bloqueado por OrgStatusGuard', async () => {
    const { orgId } = await crearOwnerConOrg(`owner-e-${Date.now()}@avicont.bo`, 'SUSPENDED');
    const saToken = await crearSuperAdmin();

    // El SA puede cambiar el status de la org suspendida
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/platform/orgs/${orgId}/status`)
      .set('Authorization', `Bearer ${saToken}`)
      .send({ status: 'ACTIVE' });

    // El SA no tiene tenantId en su JWT (org-less), así que el guard es transparente.
    // El SuperAdminGuard y RBAC deciden si puede hacer la acción.
    expect(res.status).not.toBe(403);
    // Puede ser 200 o cualquier otro si la llamada llega al handler
    expect([200, 201, 204]).toContain(res.status);
  });

  // Scenario E2: SA con activeTenantId apuntando a org SUSPENDED + mutación → bypass total
  it('Scenario E2: SA con JWT que tiene activeTenantId de org SUSPENDED → PASA (bypass isSuperAdmin)', async () => {
    // Crear org SUSPENDED y agregar el SA como miembro para que switchTenant funcione
    const saEmail2 = `sa-e2-${Date.now()}@avicont.bo`;
    const saPass2 = 'SuperAdminPass1!';
    const hashedPassword = await bcrypt.hash(saPass2, 10);
    const saUser = await prisma.user.create({
      data: { email: saEmail2, hashedPassword, isSuperAdmin: true },
    });

    // Org SUSPENDED con el SA como OWNER para que switchTenant lo acepte
    const org = await prisma.organization.create({
      data: {
        name: `Org SA E2 ${Date.now()}`,
        slug: `org-sa-e2-${Date.now()}`,
        status: 'SUSPENDED',
        memberships: { create: { userId: saUser.id, systemRole: 'OWNER' } },
      },
    });

    // Login org-less (SA sin tenant) y luego switch-tenant para obtener JWT con activeTenantId
    const orgLessToken = await login(app, saEmail2, saPass2);
    const switchRes = await request(app.getHttpServer())
      .post('/api/auth/switch-tenant')
      .set('Authorization', `Bearer ${orgLessToken}`)
      .send({ tenantId: org.id });
    expect(switchRes.status).toBe(200);
    const saTokenConTenant = switchRes.body.accessToken as string;

    // Mutación con el token que tiene activeTenantId → org SUSPENDED
    // El guard debe hacer bypass porque isSuperAdmin === true, sin importar el status de la org
    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${saTokenConTenant}`)
      .send({ name: 'SA puede mutar aunque org esté SUSPENDED' });

    // No debe ser 403 del OrgStatusGuard
    expect(res.status).not.toBe(403);
  });

  // Scenario F: cambio de status → caché invalidado → siguiente request refleja nuevo estado
  it('Scenario F: ACTIVE → SUSPENDED → siguiente PATCH → 403 (caché invalidado)', async () => {
    const ownerEmail = `owner-f-${Date.now()}@avicont.bo`;
    const { orgId, token } = await crearOwnerConOrg(ownerEmail, 'ACTIVE');

    // 1. Verificar que PATCH funciona con org ACTIVE
    const res1 = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nombre Antes' });
    expect(res1.status).toBe(200);

    // 2. Cambiar status a SUSPENDED directamente en BD (simula actualizarStatus sin pasar por API)
    //    y luego invalidar la caché manualmente (como lo haría actualizarStatus real)
    await prisma.organization.update({
      where: { id: orgId },
      data: { status: 'SUSPENDED' },
    });
    await redis.del(`org-status:${orgId}`);

    // 3. El mismo token → ahora debe devolver 403
    const res2 = await request(app.getHttpServer())
      .patch('/api/tenants/current')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nombre Después' });

    expect(res2.status).toBe(403);
    expect(res2.body.error.code).toBe('ORG_STATUS_NO_ACTIVE');
  });
});
