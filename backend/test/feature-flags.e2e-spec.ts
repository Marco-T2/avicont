import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

describe('Feature Flags (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let orgId: string;

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
      data: { email: 'owner@ff.bo', hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug: 'org-ff',
        name: 'Org FF',
        contabilidadEnabled: true,
        granjaEnabled: false,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });
    orgId = org.id;
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner@ff.bo', password: 'password123' });
    ownerToken = loginRes.body.accessToken;
  });

  it('debe leer features iniciales', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tenants/current/features')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ contabilidadEnabled: true, granjaEnabled: false });
  });

  it('debe togglear features parcialmente', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current/features')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ granjaEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ contabilidadEnabled: true, granjaEnabled: true });

    const res2 = await request(app.getHttpServer())
      .patch('/api/tenants/current/features')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ contabilidadEnabled: false });
    expect(res2.body).toEqual({ contabilidadEnabled: false, granjaEnabled: true });
  });

  it('debe rechazar PATCH sin permiso', async () => {
    // Crear miembro contador (sin permiso feature-flags.update)
    const hashedPassword = await bcrypt.hash('password123', 10);
    const contador = await prisma.user.create({
      data: { email: 'cont@ff.bo', hashedPassword },
    });
    const role = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.*'],
      },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: contador.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'cont@ff.bo', password: 'password123' });
    const contToken = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .patch('/api/tenants/current/features')
      .set('Authorization', `Bearer ${contToken}`)
      .set('X-Tenant-ID', orgId)
      .send({ granjaEnabled: true });
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
