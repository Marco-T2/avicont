import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanupTestData } from './helpers/test-factory';

describe('Impersonation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let orgId: string;
  let targetUserId: string;
  let otherOwnerId: string;

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
    const hashedPassword = await bcrypt.hash('password123', 10);

    const owner = await prisma.user.create({
      data: { email: 'owner@imp.bo', hashedPassword, isEmailVerified: true },
    });
    const target = await prisma.user.create({
      data: { email: 'target@imp.bo', hashedPassword, isEmailVerified: true },
    });
    targetUserId = target.id;

    const otherOwner = await prisma.user.create({
      data: { email: 'other@imp.bo', hashedPassword, isEmailVerified: true },
    });
    otherOwnerId = otherOwner.id;

    const org = await prisma.organization.create({
      data: {
        slug: 'org-imp',
        name: 'Org Imp',
        memberships: {
          create: [
            { userId: owner.id, systemRole: SystemRole.OWNER },
            { userId: otherOwner.id, systemRole: SystemRole.OWNER },
          ],
        },
      },
    });
    orgId = org.id;

    const role = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.*'],
      },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: target.id, customRoleId: role.id },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner@imp.bo', password: 'password123' });
    ownerToken = loginRes.body.accessToken;
  });

  /** Ayudante: crear super-admin y obtener su token. */
  async function setupSuperAdmin(email = 'superadmin@imp.bo', password = 'password123') {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, hashedPassword, isEmailVerified: true, isSuperAdmin: true },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    expect(loginRes.status).toBe(200);
    return loginRes.body.accessToken as string;
  }

  it('debe iniciar impersonation, registrar acciones y cerrar', async () => {
    const startRes = await request(app.getHttpServer())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ targetUserId, reason: 'Soporte: Juan no ve sus comprobantes' });
    expect(startRes.status).toBe(201);
    const impToken = startRes.body.impersonationToken as string;
    const impId = startRes.body.impersonationId as string;
    const payload = JSON.parse(Buffer.from(impToken.split('.')[1] ?? '', 'base64').toString());
    expect(payload.sub).toBe(targetUserId);
    expect(payload.impersonatedBy).toBeTruthy();
    expect(payload.impersonationId).toBe(impId);

    // Hacer una request auditable
    const r = await request(app.getHttpServer())
      .get('/api/permissions')
      .set('Authorization', `Bearer ${impToken}`);
    expect(r.status).toBe(200);

    // Esperar al async tap del interceptor (write a ImpersonationAction)
    await new Promise((res) => setTimeout(res, 200));

    const actions = await prisma.impersonationAction.findMany({
      where: { impersonationLogId: impId },
    });
    expect(actions.length).toBeGreaterThanOrEqual(1);

    // Cerrar
    const endRes = await request(app.getHttpServer())
      .post('/api/admin/impersonate/end')
      .set('Authorization', `Bearer ${impToken}`);
    expect(endRes.status).toBe(204);

    const log = await prisma.impersonationLog.findUnique({ where: { id: impId } });
    expect(log?.endedAt).not.toBeNull();
  });

  it('debe rechazar impersonar a otro OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ targetUserId: otherOwnerId, reason: 'no debería funcionar' });
    expect(res.status).toBe(403);
  });

  it('debe rechazar impersonar a sí mismo', async () => {
    const ownerId = JSON.parse(
      Buffer.from(ownerToken.split('.')[1] ?? '', 'base64').toString(),
    ).sub;
    const res = await request(app.getHttpServer())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ targetUserId: ownerId, reason: 'no se puede impersonar a uno mismo' });
    expect(res.status).toBe(400);
  });

  it('debe rechazar dos impersonations activas en simultáneo', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ targetUserId, reason: 'primera sesión activa' });

    const res = await request(app.getHttpServer())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ targetUserId, reason: 'segunda sesión, debería rechazarse' });
    expect(res.status).toBe(409);
  });

  it('debe rechazar impersonation iniciada por non-OWNER', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const member = await prisma.user.create({
      data: { email: 'member@imp.bo', hashedPassword },
    });
    const role = await prisma.customRole.findFirst({ where: { slug: 'contador' } });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: member.id, customRoleId: role!.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'member@imp.bo', password: 'password123' });
    const memberToken = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .post('/api/admin/impersonate')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ targetUserId, reason: 'contador no puede impersonar' });
    expect(res.status).toBe(403);
  });

  describe('REQ-SA-17: impersonation cross-tenant', () => {
    it('[+] super-admin impersona MEMBER en org donde no es miembro → token emitido', async () => {
      const superAdminToken = await setupSuperAdmin();

      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ targetUserId, reason: 'Soporte: super-admin revisa cuenta del cliente' });

      expect(res.status).toBe(201);
      expect(res.body.impersonationToken).toBeTruthy();
    });

    it('[+] token de impersonation resultante NO contiene isSuperAdmin (REQ-SA-04)', async () => {
      const superAdminToken = await setupSuperAdmin();

      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ targetUserId, reason: 'Soporte: super-admin revisa cuenta del cliente' });

      expect(res.status).toBe(201);
      const impToken = res.body.impersonationToken as string;
      const payload = JSON.parse(
        Buffer.from(impToken.split('.')[1] ?? '', 'base64').toString(),
      ) as Record<string, unknown>;

      // El token de impersonation NO debe llevar isSuperAdmin (REQ-SA-04)
      expect(Object.prototype.hasOwnProperty.call(payload, 'isSuperAdmin')).toBe(false);
      // Sí debe tener los claims de impersonation
      expect(payload.sub).toBe(targetUserId);
      expect(payload.impersonatedBy).toBeTruthy();
    });

    it('[+] impersonation cross-tenant deja fila en platform_audit con action platform.impersonation.start', async () => {
      const superAdminToken = await setupSuperAdmin('sa-audit@imp.bo');

      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ targetUserId, reason: 'Soporte: revisión de cuenta cross-tenant' });

      expect(res.status).toBe(201);
      const impId = res.body.impersonationId as string;

      // Dar tiempo al void fire-and-forget del platformAudit.record
      await new Promise((resolve) => setTimeout(resolve, 200));

      const auditRow = await prisma.platformAudit.findFirst({
        where: { action: 'platform.impersonation.start', targetOrganizationId: orgId },
      });
      expect(auditRow).not.toBeNull();
      expect(auditRow?.payload).toMatchObject({ impersonationId: impId });
    });

    it('[+] impersonation cross-tenant también crea ImpersonationLog (auditoría existente intacta)', async () => {
      const superAdminToken = await setupSuperAdmin('sa-log@imp.bo');

      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ targetUserId, reason: 'Soporte: revisión doble auditoría' });

      expect(res.status).toBe(201);
      const impId = res.body.impersonationId as string;

      const log = await prisma.impersonationLog.findUnique({ where: { id: impId } });
      expect(log).not.toBeNull();
      expect(log?.targetUserId).toBe(targetUserId);
    });

    it('[-] super-admin NO puede impersonar a un OWNER → 403', async () => {
      const superAdminToken = await setupSuperAdmin('sa-noowner@imp.bo');

      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ targetUserId: otherOwnerId, reason: 'no debería poder impersonar a un owner' });

      expect(res.status).toBe(403);
    });

    it('[-] usuario no-super-admin sin OWNER en org destino → 403 (SoloOwnerPuedeImpersonarError, regresión)', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const nonMember = await prisma.user.create({
        data: { email: 'nonmember@imp.bo', hashedPassword, isEmailVerified: true },
      });
      // nonMember tiene su propia org (OWNER) pero no es miembro de orgId
      const otherOrg = await prisma.organization.create({
        data: {
          slug: 'other-org-imp',
          name: 'Other Org',
          memberships: { create: [{ userId: nonMember.id, systemRole: SystemRole.OWNER }] },
        },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nonmember@imp.bo', password: 'password123' })
        .set('X-Tenant-ID', otherOrg.id);
      // Login standard — activeTenantId del JWT apunta a su propia org
      const nonMemberToken = loginRes.body.accessToken as string;

      // Intenta impersonar en orgId donde no tiene membresía ni es super-admin
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${nonMemberToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ targetUserId, reason: 'no debería poder impersonar sin membership' });

      expect(res.status).toBe(403);
    });

    it('[-] no-super-admin sin membresía en org destino → 403', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const stranger = await prisma.user.create({
        data: { email: 'stranger@imp.bo', hashedPassword, isEmailVerified: true },
      });
      // Crear org propia para poder loguearse
      const strangerOrg = await prisma.organization.create({
        data: {
          slug: 'stranger-org',
          name: 'Stranger Org',
          memberships: { create: [{ userId: stranger.id, systemRole: SystemRole.OWNER }] },
        },
      });
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'stranger@imp.bo', password: 'password123' });
      const strangerToken = loginRes.body.accessToken as string;

      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${strangerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ targetUserId, reason: 'extraño sin membresía no puede impersonar' });

      expect(res.status).toBe(403);
    });
  });

  describe('REQ-SA-17 delta: SA org-less impersonation con organizationId', () => {
    let saOrglessToken: string;
    let targetOrgId: string;
    let targetMemberId: string;
    let targetOwnerIdInTargetOrg: string;

    beforeEach(async () => {
      // Crear una segunda org con sus propios miembros — completamente ajena al SA
      const hashedPassword = await bcrypt.hash('password123', 10);

      const targetOwner = await prisma.user.create({
        data: { email: 'targetowner@sa-imp.bo', hashedPassword, isEmailVerified: true },
      });
      targetOwnerIdInTargetOrg = targetOwner.id;

      const targetMember = await prisma.user.create({
        data: { email: 'targetmember@sa-imp.bo', hashedPassword, isEmailVerified: true },
      });
      targetMemberId = targetMember.id;

      const targetOrg = await prisma.organization.create({
        data: {
          slug: 'sa-imp-target-org',
          name: 'SA Imp Target Org',
          memberships: {
            create: [{ userId: targetOwner.id, systemRole: SystemRole.OWNER }],
          },
        },
      });
      targetOrgId = targetOrg.id;

      // Crear el role y el miembro para targetOrg
      const role = await prisma.customRole.create({
        data: {
          organizationId: targetOrgId,
          slug: 'contador-sa',
          name: 'Contador SA',
          permissions: ['contabilidad.*'],
        },
      });
      await prisma.membership.create({
        data: { organizationId: targetOrgId, userId: targetMember.id, customRoleId: role.id },
      });

      // SA org-less: sin activeTenantId en JWT (no tiene membresía en ninguna org)
      saOrglessToken = await setupSuperAdmin('sa-orgless@sa-imp.bo');
    });

    it('[+] SA envía organizationId → 201 + impersonationToken; token NO contiene isSuperAdmin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${saOrglessToken}`)
        .send({
          targetUserId: targetMemberId,
          reason: 'SA cross-tenant: revisar cuenta del cliente',
          organizationId: targetOrgId,
        });

      expect(res.status).toBe(201);
      expect(res.body.impersonationToken).toBeTruthy();
      expect(res.body.impersonationId).toBeTruthy();
      expect(res.body.expiresAt).toBeTruthy();

      // El token de impersonation NO debe llevar isSuperAdmin (REQ-SA-04)
      const impToken = res.body.impersonationToken as string;
      const payload = JSON.parse(
        Buffer.from(impToken.split('.')[1] ?? '', 'base64').toString(),
      ) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(payload, 'isSuperAdmin')).toBe(false);
      expect(payload.sub).toBe(targetMemberId);
    });

    it('[+] fila en platform_audit y en ImpersonationLog', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${saOrglessToken}`)
        .send({
          targetUserId: targetMemberId,
          reason: 'SA cross-tenant: doble auditoría test',
          organizationId: targetOrgId,
        });

      expect(res.status).toBe(201);
      const impId = res.body.impersonationId as string;

      // Dar tiempo al void fire-and-forget del platformAudit.record
      await new Promise((resolve) => setTimeout(resolve, 200));

      // ImpersonationLog creado (auditoría existente)
      const log = await prisma.impersonationLog.findUnique({ where: { id: impId } });
      expect(log).not.toBeNull();
      expect(log?.targetUserId).toBe(targetMemberId);
      expect(log?.organizationId).toBe(targetOrgId);

      // platform_audit creado (auditoría cross-tenant SA)
      const auditRow = await prisma.platformAudit.findFirst({
        where: { action: 'platform.impersonation.start', targetOrganizationId: targetOrgId },
      });
      expect(auditRow).not.toBeNull();
      expect(auditRow?.payload).toMatchObject({ impersonationId: impId });
    });

    it('[-] SA sin organizationId y sin tenant activo → 403 "Se requiere contexto de organización"', async () => {
      // SA org-less sin organizationId → resolveTenantId lanza ForbiddenException
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${saOrglessToken}`)
        .send({ targetUserId: targetMemberId, reason: 'sin org → debe fallar' });

      expect(res.status).toBe(403);
      // El GlobalExceptionFilter envuelve el mensaje en { error: { message } }
      const body = res.body as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/organización/i);
    });

    it('[-] SA intenta impersonar a OWNER de org ajena → IMPERSONATION_TARGET_ES_OWNER', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${saOrglessToken}`)
        .send({
          targetUserId: targetOwnerIdInTargetOrg,
          reason: 'SA intenta impersonar a OWNER',
          organizationId: targetOrgId,
        });

      expect(res.status).toBe(403);
    });

    it('[-] SA con organizationId pero target no es miembro de esa org → IMPERSONATION_TARGET_NO_MIEMBRO (404)', async () => {
      // targetUserId viene del describe padre → es miembro de orgId, NO de targetOrgId
      // TargetNoMiembroError extends NotFoundError → 404
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${saOrglessToken}`)
        .send({
          targetUserId,
          reason: 'target no miembro de targetOrgId',
          organizationId: targetOrgId,
        });

      expect(res.status).toBe(404);
    });

    it('[-] SA intenta impersonarse a sí mismo → IMPERSONATION_SELF_NO_PERMITIDA', async () => {
      const saPayload = JSON.parse(
        Buffer.from(saOrglessToken.split('.')[1] ?? '', 'base64').toString(),
      ) as { sub: string };

      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${saOrglessToken}`)
        .send({
          targetUserId: saPayload.sub,
          reason: 'auto-impersonation no permitida',
          organizationId: targetOrgId,
        });

      expect(res.status).toBe(400);
    });

    it('[regresión] OWNER sin organizationId → 201 exactamente como antes (retrocompat)', async () => {
      // ownerToken + X-Tenant-ID header → resolveTenantId usa header como hoy
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({ targetUserId, reason: 'regresión: OWNER flujo intacto' });

      expect(res.status).toBe(201);
      expect(res.body.impersonationToken).toBeTruthy();
      expect(res.body.impersonationId).toBeTruthy();
    });

    it('[-] OWNER envía organizationId de otra org → ignorado; resolveTenantId usa contexto propio', async () => {
      // OWNER que envía organizationId: como isSuperAdmin es false, el controller lo ignora
      // y usa resolveTenantId(req) = X-Tenant-ID header = orgId (propio)
      // → target sí es miembro de orgId → 201
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({
          targetUserId,
          reason: 'OWNER con organizationId ajena → ignorada',
          organizationId: targetOrgId,
        });

      expect(res.status).toBe(201);
    });

    it('[-] OWNER envía organizationId ajena con target SOLO en esa org → 404 (gap W2: no escalación cross-tenant)', async () => {
      // Escenario adversarial (gap W2 del verify): OWNER de orgId intenta impersonar a
      // targetMemberId, que es miembro de targetOrgId pero NO de orgId.
      // El controller ignora organizationId porque isSuperAdmin=false y usa
      // resolveTenantId(req) = orgId (propio). El service busca al target en orgId
      // y no lo encuentra → TargetNoMiembroError → 404.
      // Garantía: un OWNER no puede usar el campo organizationId para escalar privilegios
      // e impersonar en una org ajena, incluso si el target existe allí.
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({
          targetUserId: targetMemberId,
          reason: 'W2: OWNER intenta escalar a org ajena via organizationId',
          organizationId: targetOrgId,
        });

      // 404 porque el controller resuelve orgId (propio del OWNER) y targetMemberId
      // no tiene membresía ahí → TargetNoMiembroError.
      // NO debe ser 201 (que indicaría escalación cross-tenant exitosa).
      expect(res.status).toBe(404);

      // Confirmar que NO se creó ningún ImpersonationLog para este intento
      const logs = await prisma.impersonationLog.findMany({
        where: { targetUserId: targetMemberId, organizationId: orgId },
      });
      expect(logs).toHaveLength(0);
    });

    it('[-] OWNER sin organizationId con target SOLO en org ajena → mismo 404 (confirma que el body org no cambia nada)', async () => {
      // Variante: misma situación pero sin enviar organizationId en el body.
      // El resultado es idéntico: el controller usa resolveTenantId(req) = orgId,
      // el target no está en orgId → 404.
      // Este test confirma que el campo organizationId no tiene ningún efecto
      // sobre la resolución de tenant para un OWNER.
      const res = await request(app.getHttpServer())
        .post('/api/admin/impersonate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', orgId)
        .send({
          targetUserId: targetMemberId,
          reason: 'W2 variante: sin organizationId, target en org ajena → mismo 404',
        });

      expect(res.status).toBe(404);
    });
  });
});
