import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { cleanupTestData } from './helpers/test-factory';

// REQ-PAUI-01: GET /me/platform es org-less. Un super-admin sin tenant activo
// debe recibir 200 { isSuperAdmin: true }, NO 403 (a diferencia de /me/permissions).
describe('GET /api/me/platform (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  async function loginToken(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    return res.body.accessToken as string;
  }

  describe('sin autenticación', () => {
    it('sin JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/me/platform');
      expect(res.status).toBe(401);
    });
  });

  describe('super-admin', () => {
    it('super-admin SIN tenant activo → 200 { isSuperAdmin: true } (org-less, NO 403)', async () => {
      const hashedPassword = await bcrypt.hash('superpass123', 10);
      // Super-admin sin membresía → JWT sin activeTenantId.
      await prisma.user.create({
        data: {
          email: 'super-sin-tenant@test.bo',
          hashedPassword,
          isEmailVerified: true,
          isSuperAdmin: true,
        },
      });
      const token = await loginToken('super-sin-tenant@test.bo', 'superpass123');

      const res = await request(app.getHttpServer())
        .get('/api/me/platform')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isSuperAdmin: true });
    });

    it('super-admin CON tenant activo → 200 { isSuperAdmin: true }', async () => {
      const hashedPassword = await bcrypt.hash('superpass123', 10);
      const superAdmin = await prisma.user.create({
        data: {
          email: 'super-con-tenant@test.bo',
          hashedPassword,
          isEmailVerified: true,
          isSuperAdmin: true,
        },
      });
      const org = await prisma.organization.create({
        data: { slug: `org-super-${Date.now()}`, name: 'Org Super Test' },
      });
      await prisma.membership.create({
        data: { userId: superAdmin.id, organizationId: org.id, systemRole: 'OWNER' },
      });
      const token = await loginToken('super-con-tenant@test.bo', 'superpass123');

      const res = await request(app.getHttpServer())
        .get('/api/me/platform')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isSuperAdmin: true });
    });
  });

  describe('usuario normal', () => {
    it('usuario normal → 200 { isSuperAdmin: false }', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const user = await prisma.user.create({
        data: { email: 'normal@test.bo', hashedPassword, isEmailVerified: true },
      });
      const org = await prisma.organization.create({
        data: { slug: `org-normal-${Date.now()}`, name: 'Org Normal Test' },
      });
      await prisma.membership.create({
        data: { userId: user.id, organizationId: org.id, systemRole: 'OWNER' },
      });
      const token = await loginToken('normal@test.bo', 'password123');

      const res = await request(app.getHttpServer())
        .get('/api/me/platform')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isSuperAdmin: false });
    });
  });
});
