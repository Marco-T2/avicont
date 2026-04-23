import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import * as bcrypt from 'bcrypt';

describe('Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.refreshToken.deleteMany({}),
      prisma.auditLog.deleteMany({}),
      prisma.impersonationAction.deleteMany({}),
      prisma.impersonationLog.deleteMany({}),
      prisma.invitation.deleteMany({}),
      prisma.membership.deleteMany({}),
      prisma.customRole.deleteMany({}),
      prisma.featureFlag.deleteMany({}),
      prisma.organization.deleteMany({}),
      prisma.user.deleteMany({}),
    ]);
    await app.close();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.impersonationAction.deleteMany({});
    await prisma.impersonationLog.deleteMany({});
    await prisma.invitation.deleteMany({});
    await prisma.membership.deleteMany({});
    await prisma.customRole.deleteMany({});
    await prisma.featureFlag.deleteMany({});
    await prisma.organization.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe('Cross-tenant isolation', () => {
    let tenant1Token: string;
    let tenant2Token: string;
    let tenant1Id: string;
    let tenant2Id: string;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);

      // Create user 1 with tenant 1
      const user1 = await prisma.user.create({
        data: { email: 'user1@example.com', hashedPassword },
      });

      const tenant1 = await prisma.organization.create({
        data: {
          name: 'Tenant One',
          slug: 'tenant-one',
          memberships: { create: { userId: user1.id, systemRole: SystemRole.OWNER } },
        },
      });
      tenant1Id = tenant1.id;

      // Create user 2 with tenant 2
      const user2 = await prisma.user.create({
        data: { email: 'user2@example.com', hashedPassword },
      });

      const tenant2 = await prisma.organization.create({
        data: {
          name: 'Tenant Two',
          slug: 'tenant-two',
          memberships: { create: { userId: user2.id, systemRole: SystemRole.OWNER } },
        },
      });
      tenant2Id = tenant2.id;

      // Get tokens
      const res1 = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'user1@example.com', password: 'password123' });
      tenant1Token = res1.body.accessToken;

      // Verify user1 has membership
      const user1Memberships = await prisma.membership.findMany({
        where: { userId: user1.id },
      });
      expect(user1Memberships.length).toBeGreaterThan(0);
      expect(res1.status).toBe(200);
      expect(res1.body.accessToken).toBeDefined();

      const res2 = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'user2@example.com', password: 'password123' });
      tenant2Token = res2.body.accessToken;
    });

    it('should not allow user to access other tenant data', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tenants/current')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-ID', tenant2Id);

      expect([401, 403]).toContain(response.status);
    });

    it('should scope audit logs to tenant', async () => {
      const tenantsExist = await prisma.organization.findMany({
        where: { id: { in: [tenant1Id, tenant2Id] } },
      });
      expect(tenantsExist.length).toBe(2);

      await prisma.auditLog.create({
        data: {
          action: 'test.action',
          entity: 'test',
          entityId: '1',
          organizationId: tenant1Id,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'test.action',
          entity: 'test',
          entityId: '2',
          organizationId: tenant2Id,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/audit')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-ID', tenant1Id);

      if (response.status !== 200) {
        console.log('Response status:', response.status);
        console.log('Response body:', response.body);
      }
      expect(response.status).toBe(200);

      expect(response.body.length).toBe(1);
      // El endpoint devuelve el campo organizationId del AuditLog.
      expect(response.body[0].organizationId).toBe(tenant1Id);
    });
  });
});
