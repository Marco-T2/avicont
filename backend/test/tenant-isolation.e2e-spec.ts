import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanupTestData } from './helpers/test-factory';
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
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
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

    it('cada token resuelve únicamente su propio tenant', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/api/tenants/current')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .expect(200);

      expect(res1.body.id).toBe(tenant1Id);
      expect(res1.body.id).not.toBe(tenant2Id);

      const res2 = await request(app.getHttpServer())
        .get('/api/tenants/current')
        .set('Authorization', `Bearer ${tenant2Token}`)
        .expect(200);

      expect(res2.body.id).toBe(tenant2Id);
      expect(res2.body.id).not.toBe(tenant1Id);
    });

    // §4.2 / §5.4: `TenantGuard` acepta X-Tenant-ID de cualquier usuario, no solo
    // de super-admin — lo que contiene el salto es la verificación de membresía.
    // Por eso el caso negativo se afirma sobre el 403 exacto y sobre la ausencia
    // de datos del tenant ajeno en el body, no sobre un rango de status.
    it('X-Tenant-ID hacia un tenant ajeno → 403 y sin fuga de datos', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tenants/current')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-ID', tenant2Id)
        .expect(403);

      expect(JSON.stringify(response.body)).not.toContain(tenant2Id);
      expect(JSON.stringify(response.body)).not.toContain('Tenant Two');
    });

    it('X-Tenant-ID hacia el tenant propio sigue siendo válido', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tenants/current')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .set('X-Tenant-ID', tenant1Id)
        .expect(200);

      expect(response.body.id).toBe(tenant1Id);
    });
  });
});
