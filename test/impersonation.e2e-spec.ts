import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

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
    await cleanup(prisma);
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
});

async function cleanup(prisma: PrismaService) {
  await prisma.refreshToken.deleteMany({});
  await prisma.impersonationAction.deleteMany({});
  await prisma.impersonationLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.featureFlag.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}
